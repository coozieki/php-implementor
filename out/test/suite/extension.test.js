"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const ext = require("../../extension");
const vscode = require("vscode");
suite('Unit', function () {
    suite('ComposerPathsTest', function () {
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
    suite('PHPFileTest', () => {
        test('testFromNamespace', () => {
            ext.EnvironmentInfo.workspaceFolder = 'my_folder';
            const file = ext.PHPFile.fromNamespace('App\\Support\\Class');
            assert.strictEqual(file.filepath, 'my_folder/App/Support/Class.php');
        });
        test('testFromVsCodeFile', () => {
            const filepath = '/path/to/file';
            const file = vscode.Uri.file(filepath);
            assert.strictEqual(ext.PHPFile.fromVsCodeFile(file).filepath, filepath);
        });
    });
    suite('PHPFileTextTest', () => {
        test('testGetNamespace', () => {
            const namespace = 'App\\Support';
            const text = new ext.PHPFileText(`
        <?php
  
          namespace ${namespace};
  
          die();
      `);
            assert.strictEqual(text.getNamespace(), namespace);
        });
        test('testGetText', () => {
            const text = `
      <?php
  
        namespace App\\Support;
  
        die();
    `;
            assert.strictEqual(text, new ext.PHPFileText(text).getText());
        });
        test('testRemoveCommentsFromText', () => {
            const text = `
      <?php
  
      namespace App;
      
      use App\\Parents\\ParentInterface /* strange comment */ as AsParentInterface;
      use App\\Parents;
      use MathPHP\\MathInterface;
      use PHPUnit\\PHPUnitInterface;
      use SebastianBergmann\\Timer\\MyInterface;
      
      /*
      123
      */
      # 221312
      class MyClass //comment3
      # 221312
      extends namespace\\Parents\\Parent3 # 221312
        //comment1  
        /*asdasdas*/
                    implements MathInterface, AsParentInterface, Parents\\ParentInterface2, /** dasdasd */ \\App\\Parents\\ParentInterface3, ParentInterface4, PHPUnitInterface, MyInterface // comment2
      {
        # 221312
        
      }
      # 221312
    `;
            assert.strictEqual(`
      <?php
  
      namespace App;
      
      use App\\Parents\\ParentInterface  as AsParentInterface;
      use App\\Parents;
      use MathPHP\\MathInterface;
      use PHPUnit\\PHPUnitInterface;
      use SebastianBergmann\\Timer\\MyInterface;
      
      
      
      class MyClass 
      
      extends namespace\\Parents\\Parent3 
          
        
                    implements MathInterface, AsParentInterface, Parents\\ParentInterface2,  \\App\\Parents\\ParentInterface3, ParentInterface4, PHPUnitInterface, MyInterface 
      {
        
        
      }
      
    `.replace(/\s/g, ''), new ext.PHPFileText(text).removeCommentsFromText().getText().replace(/\s/g, ''));
        });
    });
});
suite('Integration', () => {
    suite('PHPFileTest', () => {
        test('testGetText', async () => {
            //@ts-ignore
            const filepath = __dirname + '/../../../src/test/test_files/Parent1.php';
            let file = new ext.PHPFile(filepath);
            assert.strictEqual('Example file text', (await file.getText()).getText());
        });
    });
});
//# sourceMappingURL=extension.test.js.map