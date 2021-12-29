import * as vscode from 'vscode';

type StringToStringObj = {[key: string]: string};
type StringToArrayOfStringsObj = {[key: string]: Array<string>};

type MethodInfo = {
  declaration: string;
  methodName: string;
};

export class EnvironmentInfo {
  static editor: vscode.TextEditor;
  static doc: vscode.TextDocument;
  static workspaceFolder: string;

  static isDefined() {
    return EnvironmentInfo.doc !== undefined && EnvironmentInfo.editor !== undefined && EnvironmentInfo.workspaceFolder !== undefined;
  }
}

export class ComposerPaths {
  classmap: StringToArrayOfStringsObj;
  rootNamespaces: StringToStringObj;

  constructor() {
    this.classmap = {};
    this.rootNamespaces = {};
  }

  clear() {
    this.classmap = {};
    this.rootNamespaces = {};
  }
}

export class PHPFileText {
  private text: string;

  constructor(text: string) {
    this.text = text;
  }

  getNamespace() {
    let nI = this.text.indexOf('namespace');
    let namespace = this.text.substring(nI+9, this.text.indexOf(";", nI)).trim();
  
    return namespace;
  }

  getText() {
    return this.text;
  }

  getClassWithNamespace(className: string) {
    let match = null;
    let matches;
    if (className.indexOf('\\') !== -1) {
      match = className;
      if (match.indexOf("\\") === 0) {
        match = match.replace("\\", '');
      }
      let namespace = match.substring(0, match.lastIndexOf("\\"));
      if (namespace.indexOf('namespace') === 0) {
        match = match.replace(namespace, namespace.replace('namespace', this.text));
      } else {
        let regExp = `(?<=use)[^;]+${namespace}\\s*(?=;)`;
        matches = this.text.match(new RegExp(regExp, "gs")); 
        if (matches) {
          match = match.replace(namespace, matches[0].trim());
        }
      }
    } else {
      let regExp = `(?<=use)[^;]+[\\s]+(?=as[\\s]+${className};)`;
      matches = this.text.match(new RegExp(regExp, "gs"));
      if (!matches) {
        matches = this.text.match(new RegExp(`(?<=use)[\\s]+[^;]+${className}(?=;)`, "gs"));
      }
  
      if (matches) {
        match = matches[0];
      }
    }
  
    if (!match)
      match = this.getNamespace() + "\\" + className;
    else 
      match = match.trim();
  
    match = this.formatNamespace(match);
  
    return match;
  }

  async getAllParents(result: Array<{parent: string, methods: Array<MethodInfo>}> = []) {
    let eI = this.text.indexOf('extends');
    let impI = this.text.indexOf('implements');
  
    if (eI === -1 && impI === -1)
      return result;
  
    let parents: Array<string> = [];
    if (eI !== -1) {
      let classes: string | Array<string> = this.text.substring(eI+7, impI !== -1 ? impI : this.text.indexOf("{", eI)).trim();
      while(classes.indexOf(' ') !== -1) {
        classes = classes.replace(/ /g, '');
      }
    
      classes = classes.split(',');
  
      classes.forEach(($class: string) => {
        parents.push(this.getClassWithNamespace($class));
      });
    }
    if (impI !== -1) {
      let interfaces: string | Array<string> = this.text.substring(impI+10, this.text.indexOf("{", impI)).trim();
      while(interfaces.indexOf(' ') !== -1) {
        interfaces = interfaces.replace(/ /g, '');
      }
  
      interfaces = interfaces.split(',');
  
      interfaces.forEach(($interface: string) => {
        parents.push(this.getClassWithNamespace($interface));
      });
    }
  
      
    for (const parent of parents) {
      let parentText = await getFileText(parent);
  
      await this.getAllParents(result);
    
      result.push({
        parent: parent,
        methods: parentText.getAbstractMethods()
      });
    }
    
    let implementedMethods = this.getImplementedMethods();
  
    result.forEach((parent, resultIndex) => {
      result[resultIndex].methods = parent.methods.filter((method) => {
        return implementedMethods.find(val => method.methodName == val.methodName) === undefined;
      });
    });
  
    result = result.filter(parent => parent.methods.length > 0);
  
    return result;
  }

  removeCommentsFromText() {
    this.text = this.text.replace(/\/\/.*$/gm, '').replace(/\/\*(.*?)\*\//gs, '').replace(/\#.*$/gm, '');

    return this;
  }

  private getImplementedMethods() {
    let methods: Array<MethodInfo> = [];
    //@ts-ignore
    let matches = this.text.matchAll(/(?<=\s)(((public)|(static)|(protected)|(private)|(final))\s+)*function[^\n;]*\([^\)]*\)[^{\(\)]*(?={)/gs);
    Array.from(matches).forEach((val) => {
      //@ts-ignore
      let func = val[0];
      methods.push({
        declaration: func.replace('{', '').trim(),
        methodName: func.substring(func.indexOf('function') + 8, func.indexOf('(')).trim()
      });
    });
  
    return methods;
  }
  
  private getAbstractMethods(): Array<MethodInfo> {	
    let methods: Array<MethodInfo> = []; 
    //@ts-ignore
    let matches = this.text.getText().matchAll(/(?<=\s)(((public)|(static)|(protected)|(private)|(abstract))\s+)*function[^\n;]*\([^\)]*\)[\s\:\w]*(?=;)/gs);
    Array.from(matches).forEach((val) => {
      //@ts-ignore
      let func = val[0];
      methods.push({
        declaration: func.replace('abstract', '').trim().replace('  ', ' '),
        methodName: func.substring(func.indexOf('function') + 8, func.indexOf('(')).trim()
      });
    });
  
    return methods;
  }

  private formatNamespace(namespace: string) {
    while (namespace.indexOf("\\\\") !== -1) {
      namespace = namespace.replace("\\\\", "\\");
    }
  
    return namespace;
  }
}

export class PHPFile {
  filepath: string;
  text: string | undefined;

  constructor(filepath: string) {
    this.filepath = filepath.replace(/\\/g, '/');
    while(this.filepath.indexOf('//') !== -1) {
      this.filepath = this.filepath.replace(/\/\//g, '/');
    }
  }

  async getText() {
    const file = vscode.Uri.file(this.filepath);
    return new PHPFileText(await vscode.workspace.fs.readFile(file).then((data) => data.toString()));
  }

  static fromNamespace(namespace: string) {
    let filepath = EnvironmentInfo.workspaceFolder + "/" + namespace + '.php';

    return new PHPFile(filepath);
  }

  static fromVsCodeFile(file: vscode.Uri) {
    return new PHPFile(file.fsPath);
  }
}

let composerPaths = new ComposerPaths();
let manualPaths: StringToStringObj = {};
let useComposer: boolean | undefined;
let composerJsonPath: string | undefined;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context: vscode.ExtensionContext) {
	function setEditor() {
		if (vscode.window.activeTextEditor !== undefined) {
			EnvironmentInfo.editor = vscode.window.activeTextEditor;
			EnvironmentInfo.doc = EnvironmentInfo.editor.document;
      //@ts-ignore
      EnvironmentInfo.workspaceFolder = vscode.workspace.getWorkspaceFolder(EnvironmentInfo.doc.uri)?.uri.fsPath;
		}
	}

  async function refreshComposerPaths(newComposerJsonPath: string | undefined) {
    if (!EnvironmentInfo.isDefined()) {
      vscode.window.showErrorMessage('The editor window is not opened. Failed executing command.');
      return;
    }

    let filepath = EnvironmentInfo.workspaceFolder+'/'+newComposerJsonPath+'/'+'composer.json';
    let file = new PHPFile(filepath);

    let text;
    try {
      text = await file.getText();
    } catch(e) {
      vscode.window.showErrorMessage(`File at path \"${filepath}\" not found! Make sure you specified correct "php-implementor.composerPath" option in your ".vscode/settings.json".`);
      throw e;
    }

    const composerConfigs = JSON.parse(text.getText());

    composerPaths.clear();
    if (composerConfigs) {
      if (composerConfigs.autoload) {
        let rootNamespaces = composerConfigs.autoload['psr-4'] || {};
        for (let namespace in rootNamespaces) {
          rootNamespaces[namespace] = newComposerJsonPath+'/'+rootNamespaces[namespace];
          rootNamespaces[namespace] = rootNamespaces[namespace].replace(/\/\//g, '/');
        }
        composerPaths.rootNamespaces = rootNamespaces;
      }

      const setPackagesComposerPaths = async (composerPackages: StringToStringObj) => {
        let vendorDir = 'vendor';
        if (composerConfigs.config && composerConfigs.config['vendor-dir']) {
          vendorDir = composerConfigs.config['vendor-dir'];
        }
        
        let composerPackageConfigs: {autoload: {'psr-4': StringToStringObj, classmap: Array<string>}};

        for (let composerPackage in composerPackages) {
          file = new PHPFile(EnvironmentInfo.workspaceFolder+'/'+vendorDir+'/'+composerPackage+'/'+'composer.json');
          composerPackageConfigs = JSON.parse((await file.getText()).getText());
          
          if (composerPackageConfigs && composerPackageConfigs.autoload) {
            if (composerPackageConfigs.autoload['psr-4']) {
              let rootNamespaces = composerPaths.rootNamespaces;
              for (let composerPackageNamespace in composerPackageConfigs.autoload['psr-4']) {
                rootNamespaces[composerPackageNamespace] = vendorDir+'/'+composerPackage+'/'+composerPackageConfigs.autoload['psr-4'][composerPackageNamespace];
                rootNamespaces[composerPackageNamespace] = rootNamespaces[composerPackageNamespace].replace(/\/\//g, '/');
              }
              composerPaths.rootNamespaces = rootNamespaces;
            }

            if (composerPackageConfigs.autoload['classmap']) {
              composerPaths.classmap = typeof(composerPaths.classmap) === 'object' ? composerPaths.classmap : {};
              composerPackageConfigs.autoload['classmap'] = composerPackageConfigs.autoload['classmap'].map(
                el => (vendorDir+'/'+composerPackage+'/'+el).replace(/\/\//g, '/')
              );
              
              filepath = (vendorDir+'/'+composerPackage).replace(/\/\//g, '/');

              const packagePhpFile = (await vscode.workspace.findFiles(filepath+'/src/*.php'))[0];
              file = PHPFile.fromVsCodeFile(packagePhpFile);
              const packagePhpFileText = await file.getText();
              const rootNamespace = packagePhpFileText.getNamespace();

              composerPaths.classmap[rootNamespace] = composerPackageConfigs.autoload['classmap'];
            }
          }
        }
      }
      if (composerConfigs.require) {
        await setPackagesComposerPaths(composerConfigs.require);
      }
      if (composerConfigs['require-dev']) {
        await setPackagesComposerPaths(composerConfigs['require-dev']);
      }
    }
  }

	async function setConfiguration() {
		let configuration = vscode.workspace.getConfiguration();

		manualPaths = configuration.get('php-implementor.autoloads') || {};

    const newUseComposer: boolean | undefined = configuration.get('php-implementor.useComposerAutoloads');
    const newComposerJsonPath: string | undefined = configuration.get('php-implementor.composerPath');

    if (newUseComposer && (newUseComposer !== useComposer || newComposerJsonPath !== composerJsonPath)) {
      await refreshComposerPaths(newComposerJsonPath);
    }

    useComposer = newUseComposer;
    composerJsonPath = newComposerJsonPath;

		vscode.commands.executeCommand("setContext", 'php-implementor.showInContextMenu', configuration.get('php-implementor.showInContextMenu'));
	}

	vscode.window.onDidChangeActiveTextEditor(() => {
		setEditor();
	});

	vscode.window.onDidChangeVisibleTextEditors(() => {
		setEditor();
	});

	vscode.workspace.onDidChangeConfiguration(() => {
		setConfiguration();
	});

	setEditor();

	setConfiguration();

	let implementCommand = vscode.commands.registerCommand('php-implementor.implement', async function () {
    if (!EnvironmentInfo.isDefined()) {
      vscode.window.showErrorMessage('The editor window is not opened. Failed executing command.');
      return;
    }

    let offset = EnvironmentInfo.doc.offsetAt(EnvironmentInfo.editor.selection.active);
		let pos = EnvironmentInfo.doc.positionAt(offset + 1);
		insertSnippet(pos);
	});

  let refreshCommand = vscode.commands.registerCommand('php-implementor.refreshComposerAutoloads', async function () {
    if (useComposer) {
      refreshComposerPaths(composerJsonPath);
    }
	});

	context.subscriptions.push(implementCommand);
  context.subscriptions.push(refreshCommand);
}

async function insertSnippet(pos: vscode.Position) {
	let text = "";

  let currentFileText = new PHPFileText(EnvironmentInfo.doc.getText());

	currentFileText.getAllParents().then(parents => {
		let methods: Array<string> = [];
		parents.forEach(parent => {
			parent.methods.forEach(method => {
				methods.push(method.declaration);
			});
		});
		vscode.window.showQuickPick(methods, {
			canPickMany: true,
			title: "Choose methods to implement",
			placeHolder: "Choose methods"
		}).then(pickedMethods => {
			if (pickedMethods === undefined)
				return; 
      
      EnvironmentInfo.editor.insertSnippet(new vscode.SnippetString("\n"), pos);
      let offset = EnvironmentInfo.doc.offsetAt(EnvironmentInfo.editor.selection.active.with(EnvironmentInfo.editor.selection.active.line + 1, 0));
      pos = EnvironmentInfo.doc.positionAt(offset);

			pickedMethods.forEach(method => {
				text += "\n\t" + method + "\n\t{\n\t\tthrow new \\Exception(\"Method not implemented\");\n\t}\n\t";
			});
			EnvironmentInfo.editor.insertSnippet(new vscode.SnippetString(text.replace(/\$/g, '\\$')), pos);
			vscode.window.showInformationMessage('Implemented ' + pickedMethods.length + ' methods!');
		});
	});

	return;
}

async function getFileText(namespace: string) {
	let text;

  let paths = getPaths();
  let classmap = paths instanceof ComposerPaths ? paths.classmap : {};

  let pathFound = false;
  const rootNamespaces = paths instanceof ComposerPaths ? paths.rootNamespaces : paths;
	for(let prop in rootNamespaces) {
    const reg = `^${prop}`.replace(/\\/g, '\\\\');
    if (namespace.match(new RegExp(reg, 'gs'))) {
      namespace = namespace.replace(prop, rootNamespaces[prop]);
      pathFound = true;
      break;
    }
	}

  let file: PHPFile | undefined, filepath;
  if (pathFound) {
    file = PHPFile.fromNamespace(namespace);
  } else {
    for(let classmapRoot in classmap) {
      const reg = `^${classmapRoot}`.replace(/\\/g, '\\\\');
      const filename = namespace.substr(namespace.lastIndexOf('\\') + 1);
      if (namespace.match(new RegExp(reg, 'gs'))) {
        const foundFiles = await vscode.workspace.findFiles(`${classmap[classmapRoot]}**/${filename}.php`);
        for(let foundFile of foundFiles) {
          const fileText = await PHPFile.fromVsCodeFile(foundFile).getText();
          const fileNamespace = fileText.getNamespace();
          if (fileNamespace == namespace.substr(0, namespace.lastIndexOf('\\'))) {
            file = PHPFile.fromVsCodeFile(foundFile);
            break;
          }
        }
        break;
      }
    }
  }

	try {
    if (file === undefined) {
      throw new Error();
    }
		text = await file.getText();
	} catch(e) {
    let message;
    if (useComposer) {
      message = 'Try to use "php-implementor.refreshComposerAutoloads" command or make sure you specified correct "php-implementor.composerPath" option in your ".vscode/settings.json".';
    } else {
      message = 'Make sure you specified correct root folders in "php-implementor.autoloads" option in your ".vscode/settings.json".';
    }

		vscode.window.showErrorMessage(`File at path \"${filepath}\" not found! ${message}`);
    throw e;
	}

	return text.removeCommentsFromText();
}

function getPaths() {
  return useComposer ? composerPaths : manualPaths;
}

function deactivate() {}

module.exports = {
	activate,
	deactivate,
  ComposerPaths,
  PHPFile,
  PHPFileText,
  EnvironmentInfo
}
