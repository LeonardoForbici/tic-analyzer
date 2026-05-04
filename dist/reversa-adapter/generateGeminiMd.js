"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateGeminiMd = generateGeminiMd;
const generateReversaAgentContracts_1 = require("../reversa-engine/generateReversaAgentContracts");
function generateGeminiMd(summary, _assets, extensionUri) {
    return (0, generateReversaAgentContracts_1.generateAgentContract)(summary, {
        engine: 'gemini-cli',
        targetFile: 'GEMINI.md',
        engineInstruction: 'Use this local context before answering or modifying files through Gemini CLI.',
        compact: false
    }, extensionUri);
}
//# sourceMappingURL=generateGeminiMd.js.map