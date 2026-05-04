"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAgentsMd = generateAgentsMd;
exports.baseEngineContext = baseEngineContext;
const generateReversaAgentContracts_1 = require("../reversa-engine/generateReversaAgentContracts");
function generateAgentsMd(summary, _assets, extensionUri) {
    return (0, generateReversaAgentContracts_1.generateAgentContract)(summary, {
        engine: 'codex',
        targetFile: 'AGENTS.md',
        engineInstruction: 'Leia este arquivo antes de planejar ou editar.',
        compact: false
    }, extensionUri);
}
/** @deprecated Use generateAgentContract diretamente */
function baseEngineContext(engineName, targetFile, summary, engineInstruction, _assets, extensionUri) {
    // Map legacy engine names to AgentContractEngine
    const engineMap = {
        'Codex': 'codex',
        'Claude Code': 'claude-code',
        'GitHub Copilot': 'github-copilot',
        'Cursor': 'cursor',
        'Gemini CLI': 'gemini-cli',
        'Aider': 'aider'
    };
    const engine = engineMap[engineName] ?? 'codex';
    return (0, generateReversaAgentContracts_1.generateAgentContract)(summary, { engine, targetFile, engineInstruction, compact: false }, extensionUri);
}
//# sourceMappingURL=generateAgentsMd.js.map