"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCursorRules = generateCursorRules;
const generateReversaAgentContracts_1 = require("../reversa-engine/generateReversaAgentContracts");
function generateCursorRules(summary, _assets, extensionUri) {
    return (0, generateReversaAgentContracts_1.generateAgentContract)(summary, {
        engine: 'cursor',
        targetFile: '.cursorrules',
        engineInstruction: 'Apply these project rules when proposing edits or generating code in Cursor.',
        compact: true
    }, extensionUri);
}
//# sourceMappingURL=generateCursorRules.js.map