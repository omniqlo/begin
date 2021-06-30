// https://eslint.org/docs/user-guide/configuring
module.exports = {
	root: true,
	extends: ["airbnb-base", "plugin:promise/recommended", "prettier"],
	plugins: ["promise"],
	env: {
		node: true,
	},
};
