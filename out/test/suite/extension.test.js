"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
const vscode = require("vscode");
// import * as myExtension from '../../extension';
const extension_js_1 = require("../../extension.js");
suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');
    test('Sample test', () => {
        assert.strictEqual([1, 2, 3].indexOf(5), -1);
        assert.strictEqual([1, 2, 3].indexOf(0), -1);
    });
});
suite('ComposerPathsTest', () => {
    test('testClear', () => {
        let composerPaths = new extension_js_1.ComposerPaths();
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
//# sourceMappingURL=extension.test.js.map