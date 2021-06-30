#!/usr/bin/env node

const fs = require("fs-extra");
const {resolve} = require("path");
const spawn = require("cross-spawn");
const inquirer = require("inquirer");

const cwd = process.cwd(); // Current working directory

function executeCommand(line) {
	const [command, ...args] = line;
	spawn.sync(command, args, {
		cwd,
		stdio: "inherit",
	});
}

function copySync(src, dest) {
	const srcPath = resolve(__dirname, `../files/${src}`);
	if (!fs.existsSync(srcPath)) {
		throw new Error(`The file/folder ${src} doesn't exist`);
	}
	const destPath = dest ? resolve(cwd, dest) : resolve(cwd, src);
	fs.copySync(srcPath, destPath, {overwrite: true});
}

const constants = Object.freeze({
	browser: "browser",
	commitizen: "commitizen",
	commitlint: "commitlint",
	editorconfig: "editorconfig",
	eslint: "eslint",
	filesToApplyPrettier:
		"css,graphql,html,js,json,jsx,less,md,mdx,scss,ts,tsx,vue,yaml,yml",
	fixpack: "fixpack",
	github: "github",
	husky: "husky",
	jest: "jest",
	js: "js",
	lintStaged: "lintStaged",
	node: "node",
	npm: "npm",
	prettier: "prettier",
	ts: "ts",
	yarn: "yarn",
});

async function run() {
	try {
		const {packageManager, language, env, tools, addLicense, addCodeOfConduct} =
			await inquirer.prompt([
				{
					type: "list",
					name: "packageManager",
					message: "Which package manager would you like to use?",
					default: constants.yarn,
					choices: [
						{name: "npm", value: constants.npm},
						{name: "yarn", value: constants.yarn},
					],
				},
				{
					type: "list",
					name: "language",
					message: "Which language would you like to use?",
					default: constants.js,
					choices: [
						{name: "JavaScript", value: constants.js},
						{name: "TypeScript", value: constants.ts},
					],
				},
				{
					type: "list",
					name: "env",
					message: "What is the target environment?",
					default: constants.node,
					choices: [
						{name: "browser", value: constants.browser},
						{name: "node", value: constants.node},
					],
				},
				{
					type: "checkbox",
					name: "tools",
					message: "Which tools would you like to add?",
					choices: [
						{name: "commitizen", value: constants.commitizen, checked: true},
						{name: "commitlint", value: constants.commitlint, checked: true},
						{
							name: "EditorConfig",
							value: constants.editorconfig,
							checked: true,
						},
						{name: "ESLint", value: constants.eslint, checked: true},
						{name: "fixpack", value: constants.fixpack, checked: true},
						{name: "GitHub", value: constants.github, checked: true},
						{name: "Husky", value: constants.husky, checked: true},
						{name: "Jest", value: constants.jest, checked: true},
						{name: "lint-staged", value: constants.lintStaged, checked: true},
						{name: "Prettier", value: constants.prettier, checked: true},
					],
				},
				{
					type: "confirm",
					name: "addLicense",
					message: "Add a BSD 3-Clause license?",
					default: false,
				},
				{
					type: "confirm",
					name: "addCodeOfConduct",
					message: "Add a code of conduct?",
					default: false,
				},
			]);

		const useJs = language === constants.js;
		const useTs = language === constants.ts;
		const targetBrowser = env === constants.browser;
		const targetNode = env === constants.node;

		const packageJsonPath = resolve(cwd, "package.json");

		// Run "npm init -y" if package.json doesn't exist in the current working directory
		if (!fs.existsSync(packageJsonPath)) {
			executeCommand(["npm", "init", "-y"]);
		}

		let packageJson = fs.readJsonSync(packageJsonPath);
		const devDependenciesToInstall = [];
		const scriptsToAdd = {start: ""};

		if (useTs) {
			devDependenciesToInstall.push("typescript");
			scriptsToAdd["check-types"] = "tsc --noEmit";
			copySync("tsconfig.json", "tsconfig.json");
			if (targetBrowser) {
				copySync("tsconfig.browser.json", "tsconfig.base.json");
			} else if (targetNode) {
				devDependenciesToInstall.push("tsc-watch");
				scriptsToAdd.build = "tsc";
				scriptsToAdd.dev = 'tsc-watch --onSuccess "npm start" --noClear';
				copySync("tsconfig.node.json", "tsconfig.base.json");
			}
		}
		scriptsToAdd.clean = `rm -rf ${useTs && targetBrowser ? "build " : ""}${
			tools.includes(constants.jest) ? "coverage " : ""
		}${useTs && targetNode ? "dist " : ""}node_modules`;

		// Add setup script
		if (packageManager === constants.npm) {
			scriptsToAdd.setup = "npm install && npm run validate";
		} else if (packageManager === constants.yarn) {
			scriptsToAdd.setup = "yarn install && npm run validate";
		}

		// Add validate script
		let validate = "";
		let hasValidate = false;
		if (useTs) {
			hasValidate = true;
			validate += " check-types";
		}
		if (tools.includes(constants.prettier)) {
			hasValidate = true;
			validate += " format:check";
		}
		if (tools.includes(constants.eslint)) {
			hasValidate = true;
			validate += " lint";
		}
		if (tools.includes(constants.jest)) {
			hasValidate = true;
			validate += ' "test -- {@}" --';
		}
		if (hasValidate) {
			devDependenciesToInstall.push("npm-run-all");
		}
		scriptsToAdd.validate = hasValidate ? `run-s${validate}` : undefined;

		// commitizen
		if (tools.includes(constants.commitizen)) {
			devDependenciesToInstall.push("commitizen", "cz-conventional-changelog");
			packageJson.commitlint = {
				extends: ["@commitlint/config-conventional"],
			};
		}

		// commitlint
		if (tools.includes(constants.commitlint)) {
			devDependenciesToInstall.push(
				"@commitlint/cli",
				"@commitlint/config-conventional",
			);
			packageJson.config = {
				commitizen: {
					path: "cz-conventional-changelog",
				},
			};
		}

		// EditorConfig
		if (tools.includes(constants.editorconfig)) {
			copySync(".editorconfig");
		}

		// ESLint
		if (tools.includes(constants.eslint)) {
			devDependenciesToInstall.push(
				"eslint",
				"eslint-plugin-import",
				"eslint-plugin-promise",
				"eslint-watch",
			);
			if (useTs) {
				devDependenciesToInstall.push(
					"@typescript-eslint/eslint-plugin",
					"eslint-config-airbnb-typescript",
				);
				copySync("tsconfig.eslint.json");
			} else if (useJs) {
				devDependenciesToInstall.push("eslint-config-airbnb-base");
			}
			if (tools.includes(constants.jest)) {
				devDependenciesToInstall.push("eslint-plugin-jest");
			}
			if (tools.includes(constants.prettier)) {
				devDependenciesToInstall.push("eslint-config-prettier");
			}
			const eslintConfig = {
				root: true,
				/* eslint-disable-next-line no-nested-ternary */
				extends: useTs
					? tools.includes(constants.prettier)
						? [
								"plugin:@typescript-eslint/recommended",
								"airbnb-typescript/base",
								"plugin:promise/recommended",
								"prettier",
						  ]
						: [
								"plugin:@typescript-eslint/recommended",
								"airbnb-typescript/base",
								"plugin:promise/recommended",
						  ]
					: tools.includes(constants.prettier)
					? ["airbnb-base", "plugin:promise/recommended", "prettier"]
					: ["airbnb-base", "plugin:promise/recommended"],
				plugins: tools.includes(constants.jest)
					? ["jest", "promise"]
					: ["promise"],
				env: {
					"browser": targetBrowser || undefined,
					"node": targetNode || undefined,
					"jest/globals": tools.includes(constants.jest) || undefined,
				},
				parserOptions: useTs
					? {
							project: "./tsconfig.eslint.json",
							tsconfigRootDir: "__dirname",
					  }
					: undefined,
				rules: {},
				overrides: [
					tools.includes(constants.jest)
						? {
								files: [
									"**/__tests__/**/*.[jt]s?(x)",
									"**/?(*.)+(spec|test).[jt]s?(x)",
								],
								extends: ["plugin:jest/recommended"],
						  }
						: undefined,
				],
			};
			const eslintConfigPath = resolve(cwd, ".eslintrc.js");
			fs.outputFileSync(
				eslintConfigPath,
				`// https://eslint.org/docs/user-guide/configuring
				module.exports = ${JSON.stringify(eslintConfig)}`,
			);
			/* eslint-disable-next-line no-nested-ternary */
			const extensions = useJs
				? targetBrowser
					? ".js,.jsx"
					: ".js"
				: targetBrowser
				? ".js,.jsx,.ts,.tsx"
				: ".js,.ts";
			scriptsToAdd.lint = `esw --ext ${extensions} --color .`;
			scriptsToAdd["lint:fix"] = "npm run lint -- --fix";
			scriptsToAdd["lint:watch"] = "npm run lint -- -w";
			const eslintIgnorePath = resolve(cwd, ".eslintignore");
			fs.ensureFileSync(eslintIgnorePath);
			if (useTs && targetBrowser) {
				fs.appendFileSync(eslintIgnorePath, "/build/\n");
			}
			if (tools.includes(constants.jest)) {
				fs.appendFileSync(eslintIgnorePath, "/coverage/\n");
			}
			if (useTs && targetNode) {
				fs.appendFileSync(eslintIgnorePath, "/dist/\n");
			}
			fs.appendFileSync(eslintIgnorePath, "/node_modules/\n");
		}

		// fixpack
		if (tools.includes(constants.fixpack)) {
			devDependenciesToInstall.push("fixpack");
			copySync(".fixpackrc");
		}

		// GitHub
		if (tools.includes(constants.github)) {
			copySync("github", ".github");
		}

		// Husky
		if (tools.includes(constants.husky)) {
			devDependenciesToInstall.push("husky", "is-ci");
			scriptsToAdd.postinstall = "is-ci || husky install";
			if (tools.includes(constants.commitlint)) {
				copySync("commit-msg", ".husky/commit-msg");
			}
			if (tools.includes(constants.lintStaged)) {
				copySync("pre-commit", ".husky/pre-commit");
			}
			const gitIgnorePath = resolve(cwd, ".gitignore");
			fs.ensureFileSync(gitIgnorePath);
			fs.appendFileSync(gitIgnorePath, ".DS_Store\n");
			if (useTs && targetBrowser) {
				fs.appendFileSync(gitIgnorePath, "/build/\n");
			}
			if (tools.includes(constants.jest)) {
				fs.appendFileSync(gitIgnorePath, "/coverage/\n");
			}
			if (useTs && targetNode) {
				fs.appendFileSync(gitIgnorePath, "/dist/\n");
			}
			fs.appendFileSync(gitIgnorePath, "/node_modules/\n");
			fs.appendFileSync(gitIgnorePath, "npm-debug.log*\n");
			fs.appendFileSync(gitIgnorePath, "yarn-debug.log*\n");
			fs.appendFileSync(gitIgnorePath, "yarn-error.log*\n");
			executeCommand(["git", "init"]);
		}

		// Jest
		if (tools.includes(constants.jest)) {
			devDependenciesToInstall.push("jest", "jest-watch-typeahead");
			if (useTs) {
				devDependenciesToInstall.push("@types/jest", "ts-jest");
			}
			const jestConfig = {
				clearMocks: true,
				collectCoverageFrom: [],
				preset: useTs ? "ts-jest" : undefined,
				testEnvironment: targetNode ? "node" : undefined,
				watchPlugins: [
					"jest-watch-typeahead/filename",
					"jest-watch-typeahead/testname",
				],
			};
			const jestConfigPath = resolve(cwd, "jest.config.js");
			fs.outputFileSync(
				jestConfigPath,
				`// https://jestjs.io/docs/configuration
				module.exports = ${JSON.stringify(jestConfig)}`,
			);
			scriptsToAdd.test = "jest";
			scriptsToAdd["test:coverage"] = "npm test -- --coverage";
			scriptsToAdd["test:watch"] = "npm test -- --watch";
		}

		// lint-staged
		if (tools.includes(constants.lintStaged)) {
			devDependenciesToInstall.push("lint-staged", "pkg-ok");
			const lintstagedConfig = {};
			if (tools.includes(constants.fixpack)) {
				lintstagedConfig["package.json"] = "fixpack";
			}
			if (tools.includes(constants.eslint)) {
				/* eslint-disable-next-line no-nested-ternary */
				const extensions = useTs
					? targetBrowser
						? "js,jsx,ts,tsx"
						: "js,ts"
					: targetBrowser
					? "js,jsx"
					: "js";
				lintstagedConfig[`*.{${extensions}}`] = "eslint --fix";
			}
			if (tools.includes(constants.prettier)) {
				lintstagedConfig[`*.{${constants.filesToApplyPrettier}}`] =
					"prettier --write";
			}
			packageJson["lint-staged"] = lintstagedConfig;
		}

		// Prettier
		if (tools.includes(constants.prettier)) {
			devDependenciesToInstall.push("prettier");
			packageJson.prettier = {
				bracketSpacing: false,
				quoteProps: "consistent",
				trailingComma: "all",
			};
			scriptsToAdd.format = "prettier --loglevel=error --write .";
			scriptsToAdd["format:check"] = "prettier --list-different .";
			const prettierIgnorePath = resolve(cwd, ".prettierignore");
			fs.ensureFileSync(prettierIgnorePath);
			if (useTs && targetBrowser) {
				fs.appendFileSync(prettierIgnorePath, "/build/\n");
			}
			if (tools.includes(constants.jest)) {
				fs.appendFileSync(prettierIgnorePath, "/coverage/\n");
			}
			if (useTs && targetNode) {
				fs.appendFileSync(prettierIgnorePath, "/dist/\n");
			}
			fs.appendFileSync(prettierIgnorePath, "/node_modules/\n");
		}

		// Edit package.json
		packageJson = {
			...packageJson,
			private: true,
			author: "omniqlo",
			license: addLicense ? "BSD-3-Clause" : undefined,
			main: "",
			scripts: {
				...packageJson.scripts,
				...scriptsToAdd,
			},
		};
		delete packageJson.keywords;
		fs.writeJsonSync(packageJsonPath, packageJson);

		// Install dev dependencies
		if (devDependenciesToInstall.length > 0) {
			if (packageManager === constants.npm) {
				executeCommand([
					packageManager,
					"install",
					"--save-dev",
					...devDependenciesToInstall,
				]);
			} else if (packageManager === constants.yarn) {
				executeCommand([
					packageManager,
					"add",
					"--dev",
					...devDependenciesToInstall,
				]);
			}
		}

		// Format package.json
		if (tools.includes(constants.fixpack)) {
			executeCommand(["npx", "fixpack"]);
		}

		// Run the format script
		if (tools.includes(constants.prettier)) {
			executeCommand(["npx", "prettier", "--loglevel=error", "--write", "."]);
		}

		// Add a license
		if (addLicense) {
			copySync("LICENSE");
		}

		// Add a code of conduct
		if (addCodeOfConduct) {
			copySync("CODE_OF_CONDUCT.md");
		}
	} catch (err) {
		/* eslint-disable-next-line no-console */
		console.error(err);
	}
}

run();
