import { defineRule, eslintCompatPlugin } from "@oxlint/plugins";

const noCommentsRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow every comment: line, block, doc, shebang and directive alike.",
		},
		messages: {
			comment:
				"Code carries no comments. Put a decision in docs/adr, a hack in docs/issues, and a word in GLOSSARY.md, then delete this.",
		},
	},
	createOnce(context) {
		return {
			Program() {
				for (const comment of context.sourceCode.getAllComments()) {
					context.report({ loc: comment.loc, messageId: "comment" });
				}
			},
		};
	},
});

export default eslintCompatPlugin({
	meta: { name: "prosody" },
	rules: { "no-comments": noCommentsRule },
});
