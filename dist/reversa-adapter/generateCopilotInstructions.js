"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCopilotInstructions = generateCopilotInstructions;
const generateReversaAgentContracts_1 = require("../reversa-engine/generateReversaAgentContracts");
function generateCopilotInstructions(summary, _assets, extensionUri) {
    return (0, generateReversaAgentContracts_1.generateAgentContract)(summary, {
        engine: 'github-copilot',
        targetFile: '.github/copilot-instructions.md',
        engineInstruction: 'Use these instructions as repository context for suggestions, edits, and chat answers.',
        compact: true
    }, extensionUri);
}
//# sourceMappingURL=generateCopilotInstructions.js.map