# Copyright 2018 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""Library for handling the model agnostic TensorFlow graph.

In particular, the class defined creates a graph with placeholders for
feeding in FeaturesPredictionsLabels and calculating metrics via metric
callbacks., Some care must be given when creating the input placeholders
and the feedlist as they match. To achieve this, the graph is created with
an example FPL to determine FPL feed structure.
"""

from __future__ import absolute_import
from __future__ import division
# Standard __future__ imports
from __future__ import print_function

import datetime
# Standard Imports
import tensorflow as tf

from tensorflow_model_analysis import constants
from tensorflow_model_analysis import types
from tensorflow_model_analysis import util as general_util
from tensorflow_model_analysis.eval_metrics_graph import eval_metrics_graph
from tensorflow_model_analysis.eval_saved_model import encoding
from tensorflow_model_analysis.eval_saved_model import util

from typing import Any, Callable, Generator, List, Optional, Text, Tuple  # pytype: disable=not-supported-yet


def make_construct_fn(  # pylint: disable=invalid-name
    add_metrics_callbacks: Optional[List[types.AddMetricsCallbackType]],
    fpl_feed_config: eval_metrics_graph.FPLFeedConfig):
  """Returns a construct fn for constructing the model agnostic eval graph."""

  def construct_fn(model_load_seconds_callback: Callable[[int], None]):
    """Thin wrapper for the actual construct to allow for metrics."""

    def construct():  # pylint: disable=invalid-name
      """Function for constructing a model agnostic eval graph."""
      start_time = datetime.datetime.now()
      model_agnostic_eval = ModelAgnosticEvaluateGraph(add_metrics_callbacks,
                                                       fpl_feed_config)
      end_time = datetime.datetime.now()
      model_load_seconds_callback(int((end_time - start_time).total_seconds()))
      return model_agnostic_eval

    return construct

  return construct_fn


class ModelAgnosticEvaluateGraph(eval_metrics_graph.EvalMetricsGraph):
  """Class handler for using a ModelAgnosticEvaluation graph."""

  def __init__(self, add_metrics_callbacks: List[types.AddMetricsCallbackType],
               fpl_feed_config: eval_metrics_graph.FPLFeedConfig):
    # Note that we do not actually initialize the graph here. The reason is we
    # wait until we get the first FeaturesPredictionsLabels to get
    # how the graph is to be constructed. Otherwise, we will need define a
    # config.
    self._add_metrics_callbacks = add_metrics_callbacks
    self._fpl_feed_config = fpl_feed_config
    super(ModelAgnosticEvaluateGraph, self).__init__()

  def _construct_graph(self):
    """Creates a graph which we instantiate FPL infeed and metric ops."""
    with self._graph.as_default():
      # Create the infeed ops.
      self._create_infeed_ops()
      self.register_add_metric_callbacks(self._add_metrics_callbacks)

  # TODO(ckuhn): Remove need to create feeds here too.
  def _perform_metrics_update_list(
      self, features_predictions_labels_list: List[Any]) -> None:
    """Run a metrics update on a list of FPLs."""
    # Lock should be acquired before calling this function.
    feed_list = self._create_feed_for_features_predictions_labels_list(
        features_predictions_labels_list)
    try:
      self._perform_metrics_update_fn(*feed_list)
    except (RuntimeError, TypeError, ValueError,
            tf.errors.OpError) as exception:
      feed_dict = dict(
          zip(self._perform_metrics_update_fn_feed_list_keys, feed_list))
      self._log_debug_message_for_tracing_feed_errors(
          fetches=[self._all_metric_update_ops] + self._metric_variable_nodes,
          feed_list=self._perform_metrics_update_fn_feed_list)
      general_util.reraise_augmented(
          exception, 'features_predictions_labels_list = %s, feed_dict = %s' %
          (features_predictions_labels_list, feed_dict))

  def _iterate_fpl_maps_in_canonical_order(
      self
  ) -> Generator[Tuple[Text, types.FPLKeyType, types.TensorType], None, None]:
    for key, value in sorted(self._fpl_feed_config.features.items()):
      yield 'features', key, value  # pytype: disable=bad-return-type
    for key, value in sorted(self._fpl_feed_config.predictions.items()):
      yield 'predictions', key, value  # pytype: disable=bad-return-type
    for key, value in sorted(self._fpl_feed_config.labels.items()):
      yield 'labels', key, value  # pytype: disable=bad-return-type

  def _create_placeholder(self, fpl_feed: Tuple[Text, Any]):
    """Generates a placeholder op given the input fetched_tensor_value."""
    # numpy array for dense Tensor, SparseTensorValue for SparseTensor
    (tensor_type, dtype) = fpl_feed
    if tensor_type == constants.PLACEHOLDER:
      return tf.compat.v1.placeholder(dtype=dtype)
    return tf.compat.v1.sparse_placeholder(dtype=dtype)

  def _create_infeed_ops(self):
    """Instantiates the infeed ops to read in FPLs.

    This method generates the input placeholder ops given an example
    FPL. The ordering of the infeed ops should match the ordering of the
    feed list. In our case, we traverse the FPLs in the same manner:
    Features->Predictions->Labels.

    Returns:
      features_dict: The dictionary key to feature tensors as generated
        by our placeholder infeed.
      predictions_list_or_dict: The dictionary key to predictions tensors or
        list as generated by our placeholder infeed. Note that in the case
        the prediction key is "__predictions", this is special cased to a list.
      labels_list_or_dict: The dictionary key to labels tensors or
        list as generated by our placeholder infeed. Note that in the case
        the labels key is "__labels", this is special cased to a list.
      feed_list: The overall list of combined input tensor feeds.
    """

    # Create a feedlist based on the following order:
    # Features, Predictions, Labels
    # Within each, use the sorted ordering of the keys. Note that
    # this needs to match the ordering in the function
    # _create_feed_for_features_predictions_labels_list
    feed_list = []
    feed_list_keys = []

    for which_map, key, value in self._iterate_fpl_maps_in_canonical_order():
      placeholder = self._create_placeholder(value)
      getattr(self, '_' + which_map + '_map')[key] = {
          encoding.NODE_SUFFIX: placeholder
      }
      feed_list.append(placeholder)
      feed_list_keys.append((which_map, key))

    self._perform_metrics_update_fn_feed_list = feed_list
    # We also keep the associated keys for better error messages.
    self._perform_metrics_update_fn_feed_list_keys = feed_list_keys

  def _create_feed_for_features_predictions_labels_list(
      self,
      features_predictions_labels_list: List[types.FeaturesPredictionsLabels]
  ) -> List[types.TensorValue]:
    """Create feed list for a list of FeaturesPredictionsLabels."""

    # Feed in the tensors in the following order:
    # Features -> Predictions -> Labels and using the standard key ordering
    # within each bucket. This should match the placeholder definitions when
    # generating the graph.
    # Note that we need to merge all examples into one Tensor before feeding.
    tensor_feed = []

    for which_map, key, _ in self._iterate_fpl_maps_in_canonical_order():
      tensor_feed.append(
          util.merge_tensor_values([
              getattr(fpl, which_map)[key][encoding.NODE_SUFFIX]
              for fpl in features_predictions_labels_list  # pytype: disable=wrong-arg-types
          ]))

    return tensor_feed
