const {
	FunctionNode
} = require('../function-node');

/**
 * @desc [INTERNAL] Represents a single function, inside JS
 *
 * <p>This handles all the raw state, converted state, etc. Of a single function.</p>
 */
class CPUFunctionNode extends FunctionNode {
	/**
	 * @desc Parses the abstract syntax tree for to its *named function*
	 * @param {Object} ast - the AST object to parse
	 * @param {Array} retArr - return array string
	 * @returns {Array} the append retArr
	 */
	astFunctionExpression(ast, retArr) {

		// Setup function return type and name
		if (!this.isRootKernel) {
			retArr.push('function');
			retArr.push(' ');
			retArr.push(this.name);
			retArr.push('(');

			// Arguments handling
			for (let i = 0; i < this.argumentNames.length; ++i) {
				const argumentName = this.argumentNames[i];

				if (i > 0) {
					retArr.push(', ');
				}
				retArr.push('user_');
				retArr.push(argumentName);
			}

			// Function opening
			retArr.push(') {\n');
		}

		// Body statement iteration
		for (let i = 0; i < ast.body.body.length; ++i) {
			this.astGeneric(ast.body.body[i], retArr);
			retArr.push('\n');
		}

		if (!this.isRootKernel) {
			// Function closing
			retArr.push('}\n');
		}
		return retArr;
	}

	/**
	 * @desc Parses the abstract syntax tree for to *return* statement
	 * @param {Object} ast - the AST object to parse
	 * @param {Array} retArr - return array string
	 * @returns {Array} the append retArr
	 */
	astReturnStatement(ast, retArr) {
		if (this.isRootKernel) {
			retArr.push('kernelResult = ');
			this.astGeneric(ast.argument, retArr);
			retArr.push(';');
		} else if (this.isSubKernel) {
			retArr.push(`subKernelResult_${ this.name } = `);
			this.astGeneric(ast.argument, retArr);
			retArr.push(';');
			retArr.push(`return subKernelResult_${ this.name };`);
		} else {
			retArr.push('return ');
			this.astGeneric(ast.argument, retArr);
			retArr.push(';');
		}
		return retArr;
	}

	/**
	 * @desc Parses the abstract syntax tree for *literal value*
	 * @param {Object} ast - the AST object to parse
	 * @param {Array} retArr - return array string
	 * @returns {Array} the append retArr
	 */
	astLiteral(ast, retArr) {

		// Reject non numeric literals
		if (isNaN(ast.value)) {
			throw this.astErrorOutput(
				'Non-numeric literal not supported : ' + ast.value,
				ast
			);
		}

		retArr.push(ast.value);

		return retArr;
	}

	/**
	 * @desc Parses the abstract syntax tree for *binary* expression
	 * @param {Object} ast - the AST object to parse
	 * @param {Array} retArr - return array string
	 * @returns {Array} the append retArr
	 */
	astBinaryExpression(ast, retArr) {
		retArr.push('(');
		this.astGeneric(ast.left, retArr);
		retArr.push(ast.operator);
		this.astGeneric(ast.right, retArr);
		retArr.push(')');
		return retArr;
	}

	/**
	 * @desc Parses the abstract syntax tree for *identifier* expression
	 * @param {Object} idtNode - An ast Node
	 * @param {Array} retArr - return array string
	 * @returns {Array} the append retArr
	 */
	astIdentifierExpression(idtNode, retArr) {
		if (idtNode.type !== 'Identifier') {
			throw this.astErrorOutput(
				'IdentifierExpression - not an Identifier',
				idtNode
			);
		}

		switch (idtNode.name) {
			case 'Infinity':
				retArr.push('Infinity');
				break;
			default:
				if (this.constants && this.constants.hasOwnProperty(idtNode.name)) {
					retArr.push('constants_' + idtNode.name);
				} else {
					const name = this.getUserArgumentName(idtNode.name);
					const type = this.getType(idtNode);
					if (name && type && this.parent && type !== 'Number' && type !== 'Integer' && type !== 'LiteralInteger') {
						retArr.push('user_' + name);
					} else {
						retArr.push('user_' + idtNode.name);
					}
				}
		}

		return retArr;
	}

	/**
	 * @desc Parses the abstract syntax tree for *for-loop* expression
	 * @param {Object} forNode - An ast Node
	 * @param {Array} retArr - return array string
	 * @returns {Array} the parsed webgl string
	 */
	astForStatement(forNode, retArr) {
		if (forNode.type !== 'ForStatement') {
			throw this.astErrorOutput('Invalid for statement', forNode);
		}

		const initArr = [];
		const testArr = [];
		const updateArr = [];
		const bodyArr = [];
		let isSafe = null;

		if (forNode.init) {
			this.pushState('in-for-loop-init');
			this.astGeneric(forNode.init, initArr);
			for (let i = 0; i < initArr.length; i++) {
				if (initArr[i].includes && initArr[i].includes(',')) {
					isSafe = false;
				}
			}
			this.popState('in-for-loop-init');
		} else {
			isSafe = false;
		}

		if (forNode.test) {
			this.astGeneric(forNode.test, testArr);
		} else {
			isSafe = false;
		}

		if (forNode.update) {
			this.astGeneric(forNode.update, updateArr);
		} else {
			isSafe = false;
		}

		if (forNode.body) {
			this.pushState('loop-body');
			this.astGeneric(forNode.body, bodyArr);
			this.popState('loop-body');
		}

		// have all parts, now make them safe
		if (isSafe === null) {
			isSafe = this.isSafe(forNode.init) && this.isSafe(forNode.test);
		}

		if (isSafe) {
			retArr.push(`for (${initArr.join('')};${testArr.join('')};${updateArr.join('')}){\n`);
			retArr.push(bodyArr.join(''));
			retArr.push('}\n');
		} else {
			const iVariableName = this.getInternalVariableName('safeI');
			if (initArr.length > 0) {
				retArr.push(initArr.join(''), ';\n');
			}
			retArr.push(`for (let ${iVariableName}=0;${iVariableName}<LOOP_MAX;${iVariableName}++){\n`);
			if (testArr.length > 0) {
				retArr.push(`if (!${testArr.join('')}) break;\n`);
			}
			retArr.push(bodyArr.join(''));
			retArr.push(`\n${updateArr.join('')};`);
			retArr.push('}\n');
		}
		return retArr;
	}

	/**
	 * @desc Parses the abstract syntax tree for *while* loop
	 * @param {Object} whileNode - An ast Node
	 * @param {Array} retArr - return array string
	 * @returns {Array} the parsed javascript string
	 */
	astWhileStatement(whileNode, retArr) {
		if (whileNode.type !== 'WhileStatement') {
			throw this.astErrorOutput(
				'Invalid while statement',
				whileNode
			);
		}

		retArr.push('for (let i = 0; i < LOOP_MAX; i++) {');
		retArr.push('if (');
		this.astGeneric(whileNode.test, retArr);
		retArr.push(') {\n');
		this.astGeneric(whileNode.body, retArr);
		retArr.push('} else {\n');
		retArr.push('break;\n');
		retArr.push('}\n');
		retArr.push('}\n');

		return retArr;
	}

	/**
	 * @desc Parses the abstract syntax tree for *do while* loop
	 * @param {Object} doWhileNode - An ast Node
	 * @param {Array} retArr - return array string
	 * @returns {Array} the parsed webgl string
	 */
	astDoWhileStatement(doWhileNode, retArr) {
		if (doWhileNode.type !== 'DoWhileStatement') {
			throw this.astErrorOutput(
				'Invalid while statement',
				doWhileNode
			);
		}

		retArr.push('for (let i = 0; i < LOOP_MAX; i++) {');
		this.astGeneric(doWhileNode.body, retArr);
		retArr.push('if (!');
		this.astGeneric(doWhileNode.test, retArr);
		retArr.push(') {\n');
		retArr.push('break;\n');
		retArr.push('}\n');
		retArr.push('}\n');

		return retArr;

	}

	/**
	 * @desc Parses the abstract syntax tree for *Assignment* Expression
	 * @param {Object} assNode - An ast Node
	 * @param {Array} retArr - return array string
	 * @returns {Array} the append retArr
	 */
	astAssignmentExpression(assNode, retArr) {
		this.astGeneric(assNode.left, retArr);
		retArr.push(assNode.operator);
		this.astGeneric(assNode.right, retArr);
		return retArr;
	}

	/**
	 * @desc Parses the abstract syntax tree for *Block* statement
	 * @param {Object} bNode - the AST object to parse
	 * @param {Array} retArr - return array string
	 * @returns {Array} the append retArr
	 */
	astBlockStatement(bNode, retArr) {
		if (this.isState('loop-body')) {
			this.pushState('block-body'); // this prevents recursive removal of braces
			for (let i = 0; i < bNode.body.length; i++) {
				this.astGeneric(bNode.body[i], retArr);
			}
			this.popState('block-body');
		} else {
			retArr.push('{\n');
			for (let i = 0; i < bNode.body.length; i++) {
				this.astGeneric(bNode.body[i], retArr);
			}
			retArr.push('}\n');
		}
		return retArr;
	}

	/**
	 * @desc Parses the abstract syntax tree for *Variable Declaration*
	 * @param {Object} varDecNode - An ast Node
	 * @param {Array} retArr - return array string
	 * @returns {Array} the append retArr
	 */
	astVariableDeclaration(varDecNode, retArr) {
		if (varDecNode.kind === 'var') {
			this.varWarn();
		}
		retArr.push(`${varDecNode.kind} `);
		const firstDeclaration = varDecNode.declarations[0];
		const type = this.getType(firstDeclaration.init);
		for (let i = 0; i < varDecNode.declarations.length; i++) {
			this.declarations[varDecNode.declarations[i].id.name] = {
				type: type === 'LiteralInteger' ? 'Number' : type,
				dependencies: {
					constants: [],
					arguments: []
				},
				isUnsafe: false
			};
			if (i > 0) {
				retArr.push(',');
			}
			this.astGeneric(varDecNode.declarations[i], retArr);
		}
		if (!this.isState('in-for-loop-init')) {
			retArr.push(';');
		}
		return retArr;
	}

	/**
	 * @desc Parses the abstract syntax tree for *If* Statement
	 * @param {Object} ifNode - An ast Node
	 * @param {Array} retArr - return array string
	 * @returns {Array} the append retArr
	 */
	astIfStatement(ifNode, retArr) {
		retArr.push('if (');
		this.astGeneric(ifNode.test, retArr);
		retArr.push(')');
		if (ifNode.consequent.type === 'BlockStatement') {
			this.astGeneric(ifNode.consequent, retArr);
		} else {
			retArr.push(' {\n');
			this.astGeneric(ifNode.consequent, retArr);
			retArr.push('\n}\n');
		}

		if (ifNode.alternate) {
			retArr.push('else ');
			if (ifNode.alternate.type === 'BlockStatement') {
				this.astGeneric(ifNode.alternate, retArr);
			} else {
				retArr.push(' {\n');
				this.astGeneric(ifNode.alternate, retArr);
				retArr.push('\n}\n');
			}
		}
		return retArr;

	}

	/**
	 * @desc Parses the abstract syntax tree for *This* expression
	 * @param {Object} tNode - An ast Node
	 * @param {Array} retArr - return array string
	 * @returns {Array} the append retArr
	 */
	astThisExpression(tNode, retArr) {
		retArr.push('_this');
		return retArr;
	}

	/**
	 * @desc Parses the abstract syntax tree for *Member* Expression
	 * @param {Object} mNode - An ast Node
	 * @param {Array} retArr - return array string
	 * @returns {Array} the append retArr
	 */
	astMemberExpression(mNode, retArr) {
		const {
			signature,
			type,
			property,
			xProperty,
			yProperty,
			zProperty,
			name,
			origin
		} = this.getMemberExpressionDetails(mNode);
		switch (signature) {
			case 'this.thread.value':
				retArr.push(`_this.thread.${ name }`);
				return retArr;
			case 'this.output.value':
				switch (name) {
					case 'x':
						retArr.push(this.output[0]);
						break;
					case 'y':
						retArr.push(this.output[1]);
						break;
					case 'z':
						retArr.push(this.output[2]);
						break;
					default:
						throw this.astErrorOutput('Unexpected expression', mNode);
				}
				return retArr;
			case 'value':
				throw this.astErrorOutput('Unexpected expression', mNode);
			case 'value[]':
			case 'value[][]':
			case 'value[][][]':
			case 'value.value':
				if (origin === 'Math') {
					retArr.push(Math[name]);
					return retArr;
				}
				switch (property) {
					case 'r':
						retArr.push(`user_${ name }[0]`);
						return retArr;
					case 'g':
						retArr.push(`user_${ name }[1]`);
						return retArr;
					case 'b':
						retArr.push(`user_${ name }[2]`);
						return retArr;
					case 'a':
						retArr.push(`user_${ name }[3]`);
						return retArr;
				}
				break;
			case 'this.constants.value':
			case 'this.constants.value[]':
			case 'this.constants.value[][]':
			case 'this.constants.value[][][]':
				break;
			case 'fn()[]':
				this.astGeneric(mNode.object, retArr);
				retArr.push('[');
				this.astGeneric(mNode.property, retArr);
				retArr.push(']');
				return retArr;
			default:
				throw this.astErrorOutput('Unexpected expression', mNode);
		}

		if (type === 'Number' || type === 'Integer') {
			retArr.push(`${origin}_${name}`);
			return retArr;
		}

		// argument may have come from a parent
		let synonymName;
		if (this.parent) {
			synonymName = this.getUserArgumentName(name);
		}

		const markupName = `${origin}_${synonymName || name}`;

		switch (type) {
			case 'Array(2)':
			case 'Array(3)':
			case 'Array(4)':
			case 'HTMLImageArray':
			case 'ArrayTexture(4)':
			case 'HTMLImage':
			default:
				const isInput = this.isInput(synonymName || name);
				retArr.push(`${ markupName }`);
				if (zProperty && yProperty) {
					if (isInput) {
						const size = this.argumentSizes[this.argumentNames.indexOf(name)];
						retArr.push('[(');
						this.astGeneric(zProperty, retArr);
						retArr.push(`*${ size[1] * size[0]})+(`);
						this.astGeneric(yProperty, retArr);
						retArr.push(`*${ size[0] })+`);
						this.astGeneric(xProperty, retArr);
						retArr.push(']');
					} else {
						retArr.push('[');
						this.astGeneric(zProperty, retArr);
						retArr.push(']');
						retArr.push('[');
						this.astGeneric(yProperty, retArr);
						retArr.push(']');
						retArr.push('[');
						this.astGeneric(xProperty, retArr);
						retArr.push(']');
					}
				} else if (yProperty) {
					if (isInput) {
						const size = this.argumentSizes[this.argumentNames.indexOf(name)];
						retArr.push('[(');
						this.astGeneric(yProperty, retArr);
						retArr.push(`*${ size[0] })+`);
						this.astGeneric(xProperty, retArr);
						retArr.push(']');
					} else {
						retArr.push('[');
						this.astGeneric(yProperty, retArr);
						retArr.push(']');
						retArr.push('[');
						this.astGeneric(xProperty, retArr);
						retArr.push(']');
					}
				} else {
					retArr.push('[');
					this.astGeneric(xProperty, retArr);
					retArr.push(']');
				}
		}
		return retArr;
	}

	/**
	 * @desc Parses the abstract syntax tree for *call* expression
	 * @param {Object} ast - the AST object to parse
	 * @param {Array} retArr - return array string
	 * @returns  {Array} the append retArr
	 */
	astCallExpression(ast, retArr) {
		if (ast.callee) {
			// Get the full function call, unrolled
			let funcName = this.astMemberExpressionUnroll(ast.callee);

			// Register the function into the called registry
			if (this.calledFunctions.indexOf(funcName) < 0) {
				this.calledFunctions.push(funcName);
			}
			if (!this.calledFunctionsArguments[funcName]) {
				this.calledFunctionsArguments[funcName] = [];
			}

			const functionArguments = [];
			this.calledFunctionsArguments[funcName].push(functionArguments);

			// Call the function
			retArr.push(funcName);

			// Open arguments space
			retArr.push('(');

			// Add the vars
			for (let i = 0; i < ast.arguments.length; ++i) {
				const argument = ast.arguments[i];
				if (i > 0) {
					retArr.push(', ');
				}
				this.astGeneric(argument, retArr);
				const argumentType = this.getType(argument);
				if (argumentType) {
					functionArguments.push({
						name: argument.name || null,
						type: argumentType
					});
				} else {
					functionArguments.push(null);
				}
			}

			// Close arguments space
			retArr.push(')');

			return retArr;
		}

		// Failure, unknown expression
		throw this.astErrorOutput(
			'Unknown CallExpression',
			ast
		);
	}

	/**
	 * @desc Parses the abstract syntax tree for *Array* Expression
	 * @param {Object} arrNode - the AST object to parse
	 * @param {Array} retArr - return array string
	 * @returns {Array} the append retArr
	 */
	astArrayExpression(arrNode, retArr) {
		const arrLen = arrNode.elements.length;

		retArr.push('[');
		for (let i = 0; i < arrLen; ++i) {
			if (i > 0) {
				retArr.push(', ');
			}
			const subNode = arrNode.elements[i];
			this.astGeneric(subNode, retArr)
		}
		retArr.push(']');

		return retArr;
	}

	astDebuggerStatement(arrNode, retArr) {
		retArr.push('debugger;');
		return retArr;
	}

	varWarn() {
		console.warn('var declarations are not supported, weird things happen.  Use const or let');
	}
}

module.exports = {
	CPUFunctionNode
};