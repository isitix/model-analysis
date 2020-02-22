/**
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

suite('fairness-metrics-table tests', () => {
  const TABLE_DATA = [
    {
      'slice': 'col:1',
      'metrics': {
        'loss': 0.7,
        'loss against Overall': 0.5,
      }
    },
    {
      'slice': 'col:2',
      'metrics': {
        'loss': 0.72,
        'loss against Overall': 0.52,
      }
    },
    {
      'slice': 'col:3',
      'metrics': {
        'loss': 0.74,
        'loss against Overall': 0.54,
      },
    }
  ];
  const TABLE_DATA_TO_COMPARE = [
    {
      'slice': 'col:1',
      'metrics': {
        'loss': 0.35,
        'loss against Overall': 0.15,
      }
    },
    {
      'slice': 'col:2',
      'metrics': {
        'loss': 0.36,
        'loss against Overall': 0.16,
      }
    },
    {
      'slice': 'col:3',
      'metrics': {
        'loss': 0.37,
        'loss against Overall': 0.17,
      },
    }
  ];
  const BOUNDED_VALUE_DATA = [
    {
      'slice': 'col:1',
      'metrics': {
        'loss': {
          'lowerBound': 0.6,
          'upperBound': 0.8,
          'value': 0.7,
        },
        'loss against Overall': {
          'lowerBound': 0.4,
          'upperBound': 0.6,
          'value': 0.5,
        },
      }
    },
    {
      'slice': 'col:2',
      'metrics': {
        'loss': {
          'lowerBound': 0.62,
          'upperBound': 0.82,
          'value': 0.72,
        },
        'loss against Overall': {
          'lowerBound': 0.42,
          'upperBound': 0.62,
          'value': 0.52,
        },
      }
    },
    {
      'slice': 'col:3',
      'metrics': {
        'loss': {
          'lowerBound': 0.64,
          'upperBound': 0.84,
          'value': 0.74,
        },
        'loss against Overall': {
          'lowerBound': 0.44,
          'upperBound': 0.64,
          'value': 0.54,
        },
      }
    }
  ];
  const BOUNDED_VALUE_DATA_TO_COMPARE = [
    {
      'slice': 'col:1',
      'metrics': {
        'loss': {
          'lowerBound': 0.25,
          'upperBound': 0.45,
          'value': 0.35,
        },
        'loss against Overall': {
          'lowerBound': 0.05,
          'upperBound': 0.25,
          'value': 0.15,
        },
      }
    },
    {
      'slice': 'col:2',
      'metrics': {
        'loss': {
          'lowerBound': 0.26,
          'upperBound': 0.46,
          'value': 0.36,
        },
        'loss against Overall': {
          'lowerBound': 0.06,
          'upperBound': 0.26,
          'value': 0.16,
        },
      }
    },
    {
      'slice': 'col:3',
      'metrics': {
        'loss': {
          'lowerBound': 0.27,
          'upperBound': 0.47,
          'value': 0.37,
        },
        'loss against Overall': {
          'lowerBound': 0.07,
          'upperBound': 0.27,
          'value': 0.17,
        },
      }
    }
  ];

  const METRICS = ['loss', 'loss against Overall'];
  const EXAMPLE_COUNTS = [34, 84, 49];

  const MODEL_A_NAME = 'ModelA';
  const MODEL_B_NAME = 'ModelB';

  const NUM_ROWS = 4;

  let table;

  test('ComputingTableData', done => {
    table = fixture('test-fixture');

    const fillData = () => {
      table.metrics = METRICS;
      table.data = TABLE_DATA;
      table.exampleCounts = EXAMPLE_COUNTS;
      table.evalName = MODEL_A_NAME;
      setTimeout(CheckProperties, 500);
    };

    const CheckProperties = () => {
      const expected_data = [
        ['feature', 'loss', 'loss against Overall'],
        ['col:1', '0.7', '0.5'],
        ['col:2', '0.72', '0.52'],
        ['col:3', '0.74', '0.54'],
      ];

      assert.equal(table.tableData_.length, expected_data.length);
      for (var i = 0; i < NUM_ROWS; i++) {
        for (var j = 0; j < 3; j++) {
          assert.equal(table.tableData_[i][j], expected_data[i][j]);
        }
      }

      table.shadowRoot.querySelectorAll('.table-row').forEach(function(row) {
        const tableEntries = row.querySelectorAll('.table-entry');

        // Three values: metric, metricAgainstBaseline, and exampleCount
        assert.equal(tableEntries.length, 3);

        // metric and exampleCount should not be percentages
        const metric = tableEntries[0].textContent.trim();
        assert.isTrue(metric[metric.length - 1] !== '%');
        const count = tableEntries[2].textContent.trim();
        assert.isTrue(count[count.length - 1] !== '%');

        // metricAgainstBaseline should be a percentage
        const metricAgainstBaseline = tableEntries[1].textContent.trim();
        assert.isTrue(
            metricAgainstBaseline[metricAgainstBaseline.length - 1] === '%');
      });

      done();
    };

    setTimeout(fillData, 0);
  });

  test('ComputingTableData_ModelComparison', done => {
    table = fixture('test-fixture');

    const fillData = (data, dataCompare, bounded) => {
      table.metrics = METRICS;
      table.data = data;
      table.dataCompare = dataCompare;
      table.exampleCounts = EXAMPLE_COUNTS;
      table.evalName = MODEL_A_NAME;
      table.evalNameCompare = MODEL_B_NAME;
      setTimeout(() => {
        CheckProperties(bounded);
      }, 500);
    };

    const CheckProperties = (bounded) => {
      const expected_data = [
        [
          'feature', 'loss - ModelA', 'loss against Overall - ModelA',
          'loss - ModelB', 'loss against Overall - ModelB',
          'ModelB against ModelA'
        ],
        ['col:1', '0.7', '0.5', '0.35', '0.15', '-0.5'],
        ['col:2', '0.72', '0.52', '0.36', '0.16', '-0.5'],
        ['col:3', '0.74', '0.54', '0.37', '0.17', '-0.5'],
      ];

      // check table dimensions
      assert.equal(table.tableData_.length, expected_data.length);
      assert.equal(table.tableData_[0].length, expected_data[0].length);

      // check table header values
      for (var j = 0; j < 6; j++) {
        assert.equal(table.tableData_[0][j], expected_data[0][j]);
      }

      // check table content values
      for (var i = 1; i < NUM_ROWS; i++) {
        for (var j = 0; j < 6; j++) {
          const actual_data = bounded ? table.tableData_[i][j].split(' ')[0] :
                                        table.tableData_[i][j];
          assert.equal(actual_data, expected_data[i][j]);
        }
      }

      // check which cells are percentages
      table.shadowRoot.querySelectorAll('.table-row').forEach(function(row) {
        const tableEntries = row.querySelectorAll('.table-entry');

        // Six values
        //   The first eval's metric and metricAgainstBaseline,
        //   The second eval's metric and metricAgainstBaseline,
        //   evalAgainstEval, and exampleCount
        assert.equal(tableEntries.length, 6);

        // metric and exampleCount should not be percentages
        const noPercIndices = [0, 2, 5];
        noPercIndices.forEach(i => {
          const text = tableEntries[i].textContent.trim();
          assert.isTrue(text[text.length - 1] !== '%');
        });

        // metricAgainstBaseline and evalAgainstEval should be a percentage
        const percIndices = [1, 3, 4];
        percIndices.forEach(i => {
          const text = tableEntries[i].textContent.trim();
          assert.isTrue(text[text.length - 1] === '%');
        });
      });

      done();
    };

    // TODO(karanshukla): fails when both are active?
    setTimeout(() => {
      fillData(TABLE_DATA, TABLE_DATA_TO_COMPARE, false);
    }, 0);
    setTimeout(() => {
      fillData(BOUNDED_VALUE_DATA, BOUNDED_VALUE_DATA_TO_COMPARE, true);
    }, 5000);  // 5000ms to ensure the second test happens after the first
  });
});
