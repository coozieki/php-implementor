import * as assert from 'assert';
import * as vscode from 'vscode';

import * as ext from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual([1, 2, 3].indexOf(5), -1);
		assert.strictEqual([1, 2, 3].indexOf(0), -1);
	});
});

suite('ComposerPathsTest', () => {
  test('testClear', () => {
    let composerPaths = new ext.ComposerPaths();
    composerPaths.classmap = {
      key1: ['val1', 'val2']
    };
    composerPaths.rootNamespaces = {
      key1: 'val1'
    };
    composerPaths.clear();
    assert.notStrictEqual(composerPaths.rootNamespaces, {});
    assert.notStrictEqual(composerPaths.classmap, {});
  });
});