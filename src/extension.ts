// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

type StringToStringObj = {[key: string]: string};
type StringToArrayOfStringsObj = {[key: string]: Array<string>};

type MethodInfo = {
  declaration: string;
  methodName: string;
};

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

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

let editor: vscode.TextEditor;
let doc: vscode.TextDocument;
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
			editor = vscode.window.activeTextEditor;
			doc = editor.document;
		}
	}

  async function refreshComposerPaths(newComposerJsonPath: string | undefined) {
    if (doc === undefined || editor === undefined) {
      vscode.window.showErrorMessage('The editor window is not opened. Failed executing command.');
      return;
    }

    let workspaceFolder: vscode.WorkspaceFolder | string | undefined = vscode.workspace.getWorkspaceFolder(doc.uri);
    
    if (!workspaceFolder) return;
    workspaceFolder = workspaceFolder.uri.fsPath;

    let filepath = workspaceFolder+'/'+newComposerJsonPath+'/'+'composer.json';
    filepath = filepath.replace(/\/\//g, '/');

    let file = vscode.Uri.file(filepath);

    let text;
    try {
      text = await vscode.workspace.fs.readFile(file).then((data) => data.toString());
    } catch(e) {
      vscode.window.showErrorMessage(`File at path \"${filepath}\" not found! Make sure you specified correct "php-implementor.composerPath" option in your ".vscode/settings.json".`);
      throw e;
    }

    const composerConfigs = JSON.parse(text);

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
          filepath = workspaceFolder+'/'+vendorDir+'/'+composerPackage+'/'+'composer.json';
          filepath = filepath.replace(/\/\//g, '/');
          file = vscode.Uri.file(filepath);
          composerPackageConfigs = JSON.parse(await vscode.workspace.fs.readFile(file).then((data) => data.toString()));
          
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
              file = vscode.Uri.file(packagePhpFile.path);
              const packagePhpFileText = await vscode.workspace.fs.readFile(file).then((data) => data.toString());
              const rootNamespace = getNamespaceOfFile(packagePhpFileText);

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
    if (doc === undefined || editor === undefined) {
      vscode.window.showErrorMessage('The editor window is not opened. Failed executing command.');
      return;
    }

    let offset = doc.offsetAt(editor.selection.active);
		let pos = doc.positionAt(offset + 1);

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

	getAllParents(removeCommentsFromText(doc.getText())).then(parents => {
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
      
      editor.insertSnippet(new vscode.SnippetString("\n"), pos);
      let offset = doc.offsetAt(editor.selection.active.with(editor.selection.active.line + 1, 0));
      pos = doc.positionAt(offset);

			pickedMethods.forEach(method => {
				text += "\n\t" + method + "\n\t{\n\t\tthrow new \\Exception(\"Method not implemented\");\n\t}\n\t";
			});
			editor.insertSnippet(new vscode.SnippetString(text.replace(/\$/g, '\\$')), pos);
			vscode.window.showInformationMessage('Implemented ' + pickedMethods.length + ' methods!');
		});
	});

	return;
}

async function getAllParents(text: string, result: Array<{parent: string, methods: Array<MethodInfo>}> = []) {
	let eI = text.indexOf('extends');
	let impI = text.indexOf('implements');

	if (eI === -1 && impI === -1)
		return result;

	let parents: Array<string> = [];
	if (eI !== -1) {
		let classes: string | Array<string> = text.substring(eI+7, impI !== -1 ? impI : text.indexOf("{", eI)).trim();
		while(classes.indexOf(' ') !== -1) {
			classes = classes.replace(/ /g, '');
		}
	
		classes = classes.split(',');

		classes.forEach(($class: string) => {
			parents.push(getClassWithNamespace($class, text));
		});
	}
	if (impI !== -1) {
		let interfaces: string | Array<string> = text.substring(impI+10, text.indexOf("{", impI)).trim();
		while(interfaces.indexOf(' ') !== -1) {
			interfaces = interfaces.replace(/ /g, '');
		}

		interfaces = interfaces.split(',');

		interfaces.forEach(($interface: string) => {
			parents.push(getClassWithNamespace($interface, text));
		});
	}

		
	for (const parent of parents) {
		let parentText = await getFileText(parent);

		await getAllParents(parentText, result);
	
		result.push({
			parent: parent,
			methods: getAbstractMethods(parentText)
		});
	}
	
	let implementedMethods = getImplementedMethods(text);

	result.forEach((parent, resultIndex) => {
		result[resultIndex].methods = parent.methods.filter((method) => {
			return implementedMethods.find(val => method.methodName == val.methodName) === undefined;
		});
	});

	result = result.filter(parent => parent.methods.length > 0);

	return result;
}

function getClassWithNamespace(className: string, text: string) {
	let match = null;
	let matches;
	if (className.indexOf('\\') !== -1) {
		match = className;
		if (match.indexOf("\\") === 0) {
			match = match.replace("\\", '');
		}
		let namespace = match.substring(0, match.lastIndexOf("\\"));
		if (namespace.indexOf('namespace') === 0) {
			match = match.replace(namespace, namespace.replace('namespace', getNamespaceOfFile(text)));
		} else {
			let regExp = `(?<=use)[^;]+${namespace}\\s*(?=;)`;
			matches = text.match(new RegExp(regExp, "gs")); 
			if (matches) {
				match = match.replace(namespace, matches[0].trim());
			}
		}
	} else {
		let regExp = `(?<=use)[^;]+[\\s]+(?=as[\\s]+${className};)`;
		matches = text.match(new RegExp(regExp, "gs"));
		if (!matches) {
			matches = text.match(new RegExp(`(?<=use)[\\s]+[^;]+${className}(?=;)`, "gs"));
		}

		if (matches) {
			match = matches[0];
		}
	}

	if (!match)
		match = getNamespaceOfFile(text) + "\\" + className;
	else 
		match = match.trim();

	match = formatNamespace(match);

	return match;
}

function getNamespaceOfFile(text: string) {
	let nI = text.indexOf('namespace');
	let namespace = text.substring(nI+9, text.indexOf(";", nI)).trim();

	return namespace;
}

function formatNamespace(namespace: string) {
	while (namespace.indexOf("\\\\") !== -1) {
		namespace = namespace.replace("\\\\", "\\");
	}

	return namespace;
}

function getImplementedMethods(text: string) {
	let methods: Array<MethodInfo> = [];
  //@ts-ignore
	let matches = text.matchAll(/(?<=\s)(((public)|(static)|(protected)|(private)|(final))\s+)*function[^\n;]*\([^\)]*\)[^{\(\)]*(?={)/gs);
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

function getAbstractMethods(text: string): Array<MethodInfo> {	
	let methods: Array<MethodInfo> = []; 
  //@ts-ignore
	let matches = text.matchAll(/(?<=\s)(((public)|(static)|(protected)|(private)|(abstract))\s+)*function[^\n;]*\([^\)]*\)[\s\:\w]*(?=;)/gs);
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

async function getFileText(namespace: string) {
	let text;
  //@ts-ignore
  let workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri).uri.fsPath;

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

  let file: vscode.Uri | undefined, filepath;
  if (pathFound) {
    namespace = namespace.replace(/\\/g, "/").replace(/\/\//g, '/');
    filepath = workspaceFolder + "/" + namespace + '.php';
    filepath = filepath.replace(/\/\//g, '/');
  
    file = vscode.Uri.file(filepath);
  } else {
    for(let classmapRoot in classmap) {
      const reg = `^${classmapRoot}`.replace(/\\/g, '\\\\');
      const filename = namespace.substr(namespace.lastIndexOf('\\') + 1);
      if (namespace.match(new RegExp(reg, 'gs'))) {
        const foundFiles = await vscode.workspace.findFiles(`${classmap[classmapRoot]}**/${filename}.php`);
        for(let foundFile of foundFiles) {
          const fileText = await vscode.workspace.fs.readFile(foundFile).then((data) => data.toString());
          const fileNamespace = getNamespaceOfFile(fileText);
          if (fileNamespace == namespace.substr(0, namespace.lastIndexOf('\\'))) {
            file = foundFile;
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
		text = await vscode.workspace.fs.readFile(file).then((data) => data.toString());
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

	return removeCommentsFromText(text);
}

function removeCommentsFromText(text: string) {
  return text.replace(/\/\/.*$/gm, '').replace(/\/\*(.*?)\*\//gs, '').replace(/\#.*$/gm, '');
}

function getPaths() {
  return useComposer ? composerPaths : manualPaths;
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate,
  ComposerPaths
}
