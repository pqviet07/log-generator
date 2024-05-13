/**
 * @author Phung Quoc Viet
 * @email phungquocviet07@gmail.com
 * @create date 2024-05-10 17:39:53
 * @modify date 2024-05-10 17:39:53
 * @desc Auto gen code for log that have multiple custom format
 */

import { Console } from "console";
import * as vscode from "vscode";


let className = "";
let methodName = "";
let mapMethodSignature = new Map<string, number>();
let mapLineCount = new Map<string, number>();
let mapDeltaLineCount = new Map<string, number>();
let symbols: vscode.DocumentSymbol[] = [];
let domainName : string | undefined = "";

// Duyệt tìm class và method name
const findClassMethodName = (symbols: vscode.DocumentSymbol[], curLine : number) => {
	if (symbols) {
		// Process symbols to log their positions
		symbols.forEach((symbol) => {
			// The range where the symbol is declared
			const range = symbol.range;
			//console.log(`Symbol: Detail= ${symbol.detail}  Name= ${symbol.name} Kind=${symbol.kind}  \t ${range.start.line+1} : ${range.end.line+1}`);

			if (range.start.line <= curLine && curLine <= range.end.line) {
				if (symbol.kind === vscode.SymbolKind.Function || symbol.kind === vscode.SymbolKind.Method) {
					methodName = "::" + symbol.name.split("(")[0];
					if (symbol.detail && symbol.detail.length > 0) {
						className +=  "::" + symbol.detail;
					}
					// vscode.window.showInformationMessage("Symbols found method: " + symbol.detail + "  " + symbol.name);
					return;
				} else if (symbol.kind === vscode.SymbolKind.Class || symbol.kind === vscode.SymbolKind.Namespace) {
					if (symbol.kind === vscode.SymbolKind.Namespace) {
						className += "::nsp_";
					} else {
						className += "::";
					}
					className += symbol.name;
					// vscode.window.showInformationMessage("Symbols found class: " +  symbol.detail + "  " + symbol.name);
					if (symbol.children) {
						findClassMethodName(symbol.children, curLine);
					}
				}
			}
		});
	} else {
		vscode.window.showWarningMessage("No symbols found in this document");
	}
};

// Duyệt để update lại range cho các symbol
const updateSymbolsData = async (symbols: vscode.DocumentSymbol[], curLine : number, deltaLine: number) => {
	if (symbols) {
		symbols.forEach(async (symbol) => {
			if (symbol.children) {
				await updateSymbolsData(symbol.children, curLine, deltaLine);
			}
			if (symbol.range.start.line >= curLine + deltaLine) {
				const updatedRange = new vscode.Range(
					symbol.range.start.line + deltaLine,
					symbol.range.start.character,
					symbol.range.end.line,
					symbol.range.end.character
				);
				// console.log(`Symbol Range STart updated = ${symbol.detail}  Name= ${symbol.name.split("(")[0]} Kind=${symbol.kind}  \t ${symbol.range.start.line+1} -> ${updatedRange.start.line+1} `);
				// console.log("---------------------------------------------------\n");
				symbol.range = updatedRange;
			}
			if (symbol.range.end.line >= curLine + deltaLine) {
				const updatedRange = new vscode.Range(
					symbol.range.start.line,
					symbol.range.start.character,
					symbol.range.end.line + deltaLine,
					symbol.range.end.character
				);
				// console.log(`Symbol Range End updated = ${symbol.detail}  Name= ${symbol.name.split("(")[0]} Kind=${symbol.kind}  \t ${symbol.range.end.line+1} -> ${updatedRange.end.line+1}`);
				// console.log("---------------------------------------------------\n");
				symbol.range = updatedRange;
			}
		});
	}
};

const updateLineLogOrder = async (symbols: vscode.DocumentSymbol[], curLine : number, tagLog : string, exitRecursive: boolean) => {
	if (exitRecursive === true) {
		return;
	}
	if (symbols === undefined || 
		symbols === null || 
		symbols.length === 0) {
		return;
	}

	symbols.forEach(async (symbol) => {
		if (symbol.children) {
			await updateLineLogOrder(symbol.children, curLine, tagLog, false);
		}

		if (symbol.range.start.line <= curLine && curLine <= symbol.range.end.line) {
			exitRecursive = true;
			const editor = vscode.window.activeTextEditor;
			let startFuncLine = symbol.range.start.line; 
			let endFuncLine = symbol.range.end.line;
			if (editor) {
				const regex = /#(\d+)/;
				const lastLine = Math.min(endFuncLine, editor.document.lineCount);
				editor.edit((editBuilder) => {
					for (let i = startFuncLine, j = 1; i <= lastLine; i++) {
						const line = editor.document.lineAt(i);
						let lineText = line.text;
						if (lineText.includes(tagLog) && lineText.search(regex) >= 0) {
							editBuilder.replace(line.range, lineText.replace(regex, "#" + j.toString()));
							j++;
						}
						//console.log(`Line ${i + 1}: ${lineText}`);
					}
				});
			}

		} 
	});
};

const generateLogWithTag = async (logLevel : string, order: boolean) => {
	const editor = vscode.window.activeTextEditor;
	if (editor) {
		const currentPosition = editor.selection.active;
		className = "";
		methodName= "";

		// Get class name/ method name ------------------------------------------------------------------------------
		const document = editor.document;
		try {
			const start1 = performance.now();
			if (symbols.length === 0) {
				symbols = await vscode.commands.executeCommand("vscode.executeDocumentSymbolProvider", document.uri);
			}
			const end1 = performance.now();

			const start2 = performance.now();
			findClassMethodName(symbols, currentPosition.line);	
			const end2 = performance.now();

			// console.log(`Execution time1: ${end1 - start1} milliseconds. \t ${Date.now().toString()}`);
			// console.log(`Execution time2: ${end2 - start2} milliseconds. \t ${Date.now().toString()}`);
		} catch (error) {
			vscode.window.showErrorMessage("Failed to fetch symbols from the document");
		}
		
		if (order === true) {
			const curCount = mapMethodSignature.get(`${className}${methodName}`);
			if (curCount !== undefined) {
				mapMethodSignature.set(`${className}${methodName}`, curCount + 1);
			} else {
				mapMethodSignature.set(`${className}${methodName}`, 1);
			}
		}

		// Create TAG for log --------------------------------------------------------------------------------------
		let lineRange = editor.document.lineAt(currentPosition).range;
		let lineRangeUpdated = editor.document.lineAt(currentPosition).range;
		const lineText = editor.document.getText(lineRange);
		let tagLog = `RTC_LOG(${logLevel}) << \"${(domainName || "VietPQ")} ${className}${methodName} `;
		if (order === true) {
			tagLog += "#" + mapMethodSignature.get(`${className}${methodName}`);
		}
		tagLog += "\";";

		// Add log to editor
		editor.edit((editBuilder) => {
			if (lineText.trim().length === 0) {
				editBuilder.insert(currentPosition, tagLog);
			} else {
				const nextLinePosition = lineRange.end.with(lineRange.end.line + 1, 0);
				lineRangeUpdated = editor.document.lineAt(nextLinePosition).range;
				editBuilder.insert(nextLinePosition, tagLog + "\n");
			}
		});

		// Format selected code -----------------------------------------------------------------------------------------
		editor.selection = new vscode.Selection(lineRangeUpdated.start, lineRangeUpdated.end);
		await vscode.commands.executeCommand('editor.action.formatSelection');
		editor.selection = new vscode.Selection(lineRangeUpdated.start, lineRangeUpdated.start);
		//console.log(`Generated log: ${lineRangeUpdated.start.line}`);

		// Lý do phải updateSymbolsData() vì update lại symbols bằng executeCommand("vscode.executeDocumentSymbolProvider") 
		// chạy rất chậm. Do đó, cần có chiến lược update (tạm thời + nhanh) ngay lập tức symbol để đảm bảo việc spam log không bị laggy và sai lệch
		updateSymbolsData(symbols, lineRangeUpdated.start.line, 1);

		if (order === true) {
			// Update lại order cho các log có order
			updateLineLogOrder(symbols,lineRangeUpdated.start.line, `${(domainName || "VietPQ")} ${className}${methodName}`,  false);
		}

	} else {
		vscode.window.showErrorMessage( "You need to have a text editor active to use this command." );
	}
};

const updateDomainNameIfNeed =  async (context: vscode.ExtensionContext) => {
	const savedName = context.globalState.get<string>('domainName');
	if (savedName === undefined) {
		domainName = await vscode.window.showInputBox({
			prompt: 'Enter your domain (use for add to log tag)',
		});

		if (domainName !== undefined) {
			context.globalState.update('domainName', domainName);
			vscode.window.showInformationMessage(`Hello, ${domainName}!`);
			vscode.window.showInformationMessage(`From here, "${domainName}" will add before every ZRTC_LOG that help you filter log easier`, "Got it!");
		}
	} else {
		domainName = savedName;
	}
};

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	let disposable0 = vscode.workspace.onDidChangeTextDocument(async (event: vscode.TextDocumentChangeEvent) => {
		// Handle the document change
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			const document = editor.document;
			if (mapLineCount.has(document.uri.toString())) {
				const previousLineCount = mapLineCount.get(document.uri.toString());
				if (previousLineCount !== undefined) {
					mapDeltaLineCount.set(document.uri.toString(), document.lineCount - previousLineCount);
				}
			}
			mapLineCount.set(document.uri.toString(), document.lineCount);
			if (mapDeltaLineCount.get(document.uri.toString()) !== 0 && mapDeltaLineCount.get(document.uri.toString()) !== undefined) {
				const start1 = performance.now();
				symbols = await vscode.commands.executeCommand("vscode.executeDocumentSymbolProvider", document.uri);
				const end1 = performance.now();
				//console.log(`onDidChangeTextDocument: runtime = ${end1 - start1} miliseconds`);
			}
		}
	});

	let disposable1 = vscode.commands.registerCommand(
		"log-generator.generate-RTC-Log-Trace",
		async () => {
			await updateDomainNameIfNeed(context);
			generateLogWithTag("LS_TRACE", false);
		}
	);

	let disposable2 = vscode.commands.registerCommand(
		"log-generator.generate-RTC-Log-Trace-With-Suffix",
		async () => {
			await updateDomainNameIfNeed(context);
			generateLogWithTag("LS_TRACE", true);
		}
	);

	let disposable3 = vscode.commands.registerCommand(
		"log-generator.generate-RTC-Log-Error",
		async () => {
			await updateDomainNameIfNeed(context);
			generateLogWithTag("LS_ERROR", false);
		}
	);

	let disposable4 = vscode.commands.registerCommand(
		"log-generator.generate-RTC-Log-Info",
		async () => {
			await updateDomainNameIfNeed(context);
			generateLogWithTag("LS_INFO", false);
		}
	);

	let disposable5 = vscode.commands.registerCommand(
		"log-generator.generate-RTC-Log-Warning",
		async () => {
			await updateDomainNameIfNeed(context);
			generateLogWithTag("LS_WARNING", false);
		}
	);

	let disposable6 = vscode.commands.registerCommand(
		"log-generator.generate-RTC-Log-Verbose",
		async () => {
			await updateDomainNameIfNeed(context);
			generateLogWithTag("LS_VERBOSE", false);
		}
	);

	let disposable7 = vscode.workspace.onDidOpenTextDocument(async (event: vscode.TextDocument) => {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			const document = editor.document; 
			mapLineCount.set(document.uri.toString(), document.lineCount);
			symbols = await vscode.commands.executeCommand("vscode.executeDocumentSymbolProvider", document.uri);
		}
	});

	let disposable8 = vscode.commands.registerCommand('log-generator.updateSetting', async () => {
		const newValue = await vscode.window.showInputBox({
			prompt: "Enter your domain (use in log tag)",
			placeHolder: "Type the new value here"
		});

		if (newValue !== undefined) { 
			await context.globalState.update('domainName', newValue);
			vscode.window.showInformationMessage(`Setting updated to: ${newValue}`);
		}
	});

	// ---------------------------------------------------------------------------------------
	context.subscriptions.push(disposable0);
	context.subscriptions.push(disposable1);
	context.subscriptions.push(disposable2);
	context.subscriptions.push(disposable3);
	context.subscriptions.push(disposable4);
	context.subscriptions.push(disposable5);
	context.subscriptions.push(disposable6);
	context.subscriptions.push(disposable7);
	context.subscriptions.push(disposable8);
};

// This method is called when your extension is deactivated
export function deactivate() {}
