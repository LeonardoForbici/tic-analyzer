"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAgentsMd = generateAgentsMd;
const generateReversaAgentContracts_1 = require("../reversa-engine/generateReversaAgentContracts");
function generateAgentsMd(summary, _assets, extensionUri) {
    return (0, generateReversaAgentContracts_1.generateAgentContract)(summary, {
        engine: 'codex',
        targetFile: 'AGENTS.md',
        engineInstruction: 'Leia este arquivo antes de planejar ou editar.',
        compact: false
    }, extensionUri);
}
//# sourceMappingURL=generateAgentsMd.js.map