export interface SampleSignalPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  rawText: string;
}

export const SAMPLE_SIGNALS: SampleSignalPreset[] = [
  {
    id: "std-1",
    name: "Classic VIP Format (M5 CALL)",
    category: "Standard Forex",
    description: "Standard English VIP signal with immediate execution",
    rawText: `🔥 VIP TRADING SIGNAL 🔥\nPAIR: EUR/USD\nACTION: CALL 🔼\nTIMEFRAME: M5\nEXPIRATION: 5 MIN\nMARTINGALE: UP TO 1 GALE\nENTER NOW 🚀`
  },
  {
    id: "std-2",
    name: "OTC Quick 1-Min Scalp (PUT)",
    category: "OTC Binary",
    description: "OTC weekend / high-payout 1-minute expiration signal",
    rawText: `⚡️ OTC FLASH SIGNAL ⚡️\nASSET: GBPUSD-OTC\nDIRECTION: PUT (LOWER) 🔴\nEXPIRY: 1M\nPAYOUT: 89%\nENTRY: NOW`
  },
  {
    id: "std-3",
    name: "Scheduled Time Signal (14:30 UTC)",
    category: "Scheduled List",
    description: "Multi-signal daily list format with specific execution minute",
    rawText: `📊 DAILY VIP LIST - SESSÃO\n⏰ 14:30 - AUDCAD - M5 - CALL (G1)\n⏰ 14:45 - EURJPY - M5 - PUT (G1)\n⏰ 15:00 - USDJPY - M1 - CALL (SEM GALE)`
  },
  {
    id: "std-4",
    name: "Sala de Sinais (Portuguese/BR)",
    category: "International",
    description: "Widely used Brazilian signal room format",
    rawText: `🟢 SINAL CONFIRMADO\nAtivo: EURUSD\nDireção: COMPRA (CALL)\nTempo: M5\nEntrada: Imediata\nProteção: Até 2 Gales 🛡`
  },
  {
    id: "std-5",
    name: "Crypto Binary Signal (BTC 5M)",
    category: "Crypto",
    description: "Cryptocurrency high-volatility binary signal",
    rawText: `💎 CRYPTO VIP SIGNAL\nPAIR: BTC/USD\nDIRECTION: PUT 🔽\nEXPIRATION: 5 MINUTES\nMANAGEMENT: 1 GALE IF NEEDED`
  },
  {
    id: "std-6",
    name: "Ultra-Minimalist One-Liner",
    category: "Short Text",
    description: "Raw fast-entry telegram message format",
    rawText: `EURUSD M1 CALL NOW G1`
  }
];
