/**
 * Barramento de eventos único do processo.
 *
 * Antes desta peça, `src/server/index.ts` (SSE do Express) e
 * `src/mcp/server.ts` (SSE do próprio MCP server) mantinham cada um seu
 * próprio `Set<Response>` e função de broadcast, sem se enxergarem — um
 * evento publicado por um lado nunca chegava aos clientes do outro, mesmo
 * rodando no mesmo processo Node. Este módulo é a fonte de verdade única:
 * qualquer parte do sistema (pipeline, server, mcp, futuros dispatchers de
 * agente) publica aqui, e cada camada de transporte (SSE do Express, SSE do
 * MCP) apenas assina e retransmite no seu próprio formato de wire.
 */
import { EventEmitter } from 'events';

export type BusEventSource = 'pipeline' | 'mcp' | 'server' | 'agent';

export interface BusEvent {
  source: BusEventSource;
  type: string;
  payload: unknown;
  ts: string;
}

const BUS_EVENT = 'bus-event';

class TicEventBus extends EventEmitter {
  publish(event: Omit<BusEvent, 'ts'>): void {
    const full: BusEvent = { ...event, ts: new Date().toISOString() };
    this.emit(BUS_EVENT, full);
  }

  subscribe(listener: (event: BusEvent) => void): () => void {
    this.on(BUS_EVENT, listener);
    return () => this.off(BUS_EVENT, listener);
  }
}

/** Singleton do processo — importar esta instância, nunca instanciar a classe diretamente. */
export const eventBus = new TicEventBus();
eventBus.setMaxListeners(50);
