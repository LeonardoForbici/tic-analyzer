"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateClaudeMd = generateClaudeMd;
const generateReversaAgentContracts_1 = require("../reversa-engine/generateReversaAgentContracts");
function generateClaudeMd(summary, _assets, extensionUri) {
    return (0, generateReversaAgentContracts_1.generateAgentContract)(summary, {
        engine: 'claude-code',
        targetFile: 'CLAUDE.md',
        engineInstruction: 'When the user asks you to modify this project, inspect the TIC Coder Lite context files first.',
        compact: false
    }, extensionUri);
}
//# sourceMappingURL=generateClaudeMd.js.map