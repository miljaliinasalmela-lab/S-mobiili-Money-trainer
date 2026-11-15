import React, { useMemo, useState } from 'react';
import { Send, ChevronDown, ChevronUp, Calculator, Loader2 } from 'lucide-react';
import {
  computeMonthSummary,
  toolCalculateSafeToSpendAndSave,
} from '../shared/calculations.ts';
import type {
  CoachMessage,
  HealthStatusResponse,
  TrackerDatasetContext,
} from '../shared/types.ts';

interface CoachPanelProps {
  context: TrackerDatasetContext;
  messages: CoachMessage[];
  isAsking: boolean;
  health: HealthStatusResponse | null;
  onSendQuestion: (question: string) => void;
}

function formatInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="font-bold text-[#004628]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={idx}
          className="font-mono-num text-xs bg-white border border-[#E6E6E6] px-1.5 py-0.5 rounded text-[#004628]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <span key={idx} className="text-[#666666]">
          {part.slice(1, -1)}
        </span>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function renderSingleBubbleBlock(block: string): React.ReactNode {
  const lines = block.split('\n').filter((l) => l.trim().length > 0);
  const isList = lines.every((l) => l.trim().startsWith('- ') || l.trim().startsWith('* '));

  if (isList) {
    return (
      <ul className="space-y-1.5 text-xs leading-snug">
        {lines.map((line, lIdx) => (
          <li key={lIdx} className="flex items-start gap-2">
            <span className="text-[#00AA46] font-bold shrink-0">•</span>
            <span>{formatInline(line.replace(/^[-*]\s+/, ''))}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <p className="text-xs leading-snug">
      {lines.map((line, lIdx) => (
        <React.Fragment key={lIdx}>
          {formatInline(line)}
          {lIdx < lines.length - 1 && <br />}
        </React.Fragment>
      ))}
    </p>
  );
}

const QUICK_STARTER_BUBBLES: Array<{ shortLabel: string; fullQuestion: string }> = [
  {
    shortLabel: 'Safe weekly?',
    fullQuestion: 'What is safe for me to spend this week?',
  },
  {
    shortLabel: 'Prisma e-receipts?',
    fullQuestion: 'How much non-food spending did S-ryhmä e-receipts split out of my groceries?',
  },
  {
    shortLabel: 'Taxis last mo?',
    fullQuestion: 'How much did I spend on taxis last month?',
  },
  {
    shortLabel: 'Spender style?',
    fullQuestion: 'What kind of spender am I?',
  },
  {
    shortLabel: 'Dining −20%?',
    fullQuestion: 'How much could I save if I reduced dining out by 20%?',
  },
  {
    shortLabel: 'Streak & Jar?',
    fullQuestion: 'Review my 7-day quest streak, Worth-It tags, and Oops! Jar progress.',
  },
  {
    shortLabel: 'Vs. peers?',
    fullQuestion: 'How does my spending compare with Statistics Finland benchmarks?',
  },
];

export const CoachPanel: React.FC<CoachPanelProps> = ({
  context,
  messages,
  isAsking,
  health,
  onSendQuestion,
}) => {
  const [input, setInput] = useState('');
  const [expandedTraceMsgId, setExpandedTraceMsgId] = useState<string | null>(null);

  const activeMonth = useMemo(
    () =>
      context.months.find((m) => m.monthKey === context.selectedMonthKey) ||
      context.months[9] ||
      context.months[0],
    [context]
  );

  const summary = useMemo(() => computeMonthSummary(activeMonth), [activeMonth]);
  const safeData = useMemo(
    () => toolCalculateSafeToSpendAndSave(context, { month: activeMonth.monthKey }),
    [context, activeMonth.monthKey]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isAsking) return;
    onSendQuestion(trimmed);
    setInput('');
  };

  return (
    <section id="s-buddy" className="space-y-3">
      {/* Compact S-mobiili Verified Snapshot Bar */}
      <div className="grid grid-cols-4 gap-1.5">
        <div className="bg-white border border-[#E6E6E6] rounded-xl p-2 min-w-0 text-center">
          <div className="text-[10px] text-[#666666] truncate">Income</div>
          <div className="text-xs font-bold font-mono-num text-[#004628] truncate">
            €{Math.round(summary.incomeEur)}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6E6] rounded-xl p-2 min-w-0 text-center">
          <div className="text-[10px] text-[#666666] truncate">Spent</div>
          <div className="text-xs font-bold font-mono-num text-[#1F1F1F] truncate">
            €{Math.round(summary.totalSpendingEur)}
          </div>
        </div>
        <div className="bg-[#EBF7EC] border border-[#99D59F]/60 rounded-xl p-2 min-w-0 text-center">
          <div className="text-[10px] text-[#363636] truncate">Safe/wk</div>
          <div className="text-xs font-bold font-mono-num text-[#007841] truncate">
            ~€{Math.round(Number(safeData.safeToSpendWeeklyEur || 0))}
          </div>
        </div>
        <div className="bg-[#EBF7EC] border border-[#99D59F]/60 rounded-xl p-2 min-w-0 text-center">
          <div className="text-[10px] text-[#363636] truncate">Saved</div>
          <div className="text-xs font-bold font-mono-num text-[#004628] truncate">
            {summary.savingsRatePercent !== null
              ? `${summary.savingsRatePercent.toFixed(0)}%`
              : '—'}
          </div>
        </div>
      </div>

      {/* Main S-buddy Conversational Card */}
      <div className="bg-white border border-[#E6E6E6] rounded-2xl overflow-hidden flex flex-col">
        {/* S-buddy Identity & Quick Bubbles */}
        <div className="p-3 bg-[#F5F5F5] border-b border-[#E6E6E6] space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-[#91FA9B] text-[#004628] text-xs font-bold flex items-center justify-center shrink-0">
                S
              </span>
              <div>
                <div className="text-xs font-bold text-[#004628] leading-tight">S-buddy</div>
                <div className="text-[10px] text-[#666666] leading-tight">
                  {health?.geminiConfigured ? 'Gemini + 10 verified tools' : '10 verified calculators'}
                </div>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-white border border-[#E6E6E6] text-[10px] font-mono-num text-[#004628]">
              {activeMonth.monthShort} {context.year}
            </span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {QUICK_STARTER_BUBBLES.map((item) => (
              <button
                key={item.shortLabel}
                type="button"
                disabled={isAsking}
                onClick={() => onSendQuestion(item.fullQuestion)}
                className="min-h-[34px] px-3 py-1 rounded-2xl rounded-bl-xs bg-white border border-[#E6E6E6] hover:border-[#00AA46] hover:bg-[#EBF7EC] text-xs font-bold text-[#004628] transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {item.shortLabel}
              </button>
            ))}
          </div>
        </div>

        {/* Multi-Bubble Chat Feed */}
        <div className="p-3.5 space-y-3.5 max-h-[420px] overflow-y-auto">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            const hasTraces = Boolean(msg.toolTraces && msg.toolTraces.length > 0);
            const isExpanded = expandedTraceMsgId === msg.id;

            if (isUser) {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-xs bg-[#004628] text-white px-3.5 py-2">
                    <p className="text-xs leading-snug">{msg.content}</p>
                  </div>
                </div>
              );
            }

            const bubbleBlocks = msg.content
              .split(/\n\n+/)
              .map((b) => b.trim())
              .filter(Boolean);

            return (
              <div key={msg.id} className="flex flex-col items-start gap-1.5 max-w-[92%]">
                {bubbleBlocks.map((block, bIdx) => (
                  <div
                    key={bIdx}
                    className={`rounded-2xl rounded-tl-xs px-3.5 py-2.5 border ${
                      bIdx === 0
                        ? 'bg-[#EBF7EC] border-[#99D59F]/70 text-[#1F1F1F]'
                        : 'bg-[#F5F5F5] border-[#E6E6E6] text-[#1F1F1F]'
                    }`}
                  >
                    {renderSingleBubbleBlock(block)}
                  </div>
                ))}

                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[10px] text-[#666666]">
                  <span>S-buddy · {msg.supportingPeriod || activeMonth.monthLabel}</span>
                  {hasTraces && (
                    <button
                      type="button"
                      onClick={() => setExpandedTraceMsgId(isExpanded ? null : msg.id)}
                      className="inline-flex items-center gap-1 font-bold text-[#007841] hover:text-[#004628] cursor-pointer whitespace-nowrap"
                    >
                      <Calculator className="w-3 h-3" />
                      <span>
                        {msg.toolTraces!.length} calc{msg.toolTraces!.length > 1 ? 's' : ''}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>
                  )}
                </div>

                {isExpanded && hasTraces && (
                  <div className="w-full space-y-1.5 pt-1">
                    {msg.toolTraces!.map((trace, tIdx) => (
                      <div
                        key={`${trace.toolName}-${tIdx}`}
                        className="bg-[#F5F5F5] border border-[#E6E6E6] rounded-xl p-2.5 text-[11px] font-mono-num overflow-x-auto"
                      >
                        <div className="font-bold text-[#004628]">
                          {trace.toolName}({JSON.stringify(trace.args)})
                        </div>
                        <pre className="mt-1 text-[10px] text-[#363636] whitespace-pre-wrap">
                          {JSON.stringify(trace.result, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {isAsking && (
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl rounded-tl-xs bg-[#EBF7EC] text-xs text-[#004628]">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#00AA46] shrink-0" />
              <span>S-buddy is checking…</span>
            </div>
          )}
        </div>

        {/* Input Form */}
        <form
          onSubmit={handleSubmit}
          className="p-3 bg-white border-t border-[#E6E6E6] flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask S-buddy…"
            aria-label="Ask S-buddy a question"
            className="min-w-0 flex-1 min-h-[42px] px-3.5 py-2 rounded-full border border-[#E6E6E6] bg-[#F5F5F5] text-xs text-[#1F1F1F] placeholder:text-[#666666] focus:outline-none focus:bg-white focus:border-[#00AA46]"
          />
          <button
            type="submit"
            disabled={isAsking || !input.trim()}
            className="min-h-[42px] px-4 py-2 rounded-full bg-[#91FA9B] hover:bg-[#49F37B] active:bg-[#00EB5A] disabled:opacity-50 text-[#004628] text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>Send</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </section>
  );
};
