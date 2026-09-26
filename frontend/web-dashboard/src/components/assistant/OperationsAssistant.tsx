import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle2, Clock, X, ArrowLeft, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { expenseService } from '@/services/expenseService';
import { tripService, Trip } from '@/services/tripService';

const HANDLED_REMINDERS_KEY = 'mercon_assistant_handled_reminders_v2';
const SNOOZED_REMINDERS_KEY  = 'mercon_assistant_snoozed_reminders_v2';
const POSITION_KEY           = 'mercon_assistant_position_v3';
const DOCKED_KEY             = 'mercon_assistant_docked_v1';

const ASSETS = {
  profile:      '/assistant/profile.png',
  question:     '/assistant/was there any labor charge for this trip.png',
  great:        '/assistant/great.png',
  remind_later: '/assistant/when should i remind you.png',
} as const;
type AssetKey = keyof typeof ASSETS;

interface ReminderItem {
  id: string;
  tripId: string;
  tripRef: string;
  type: 'labor_charge';
  title: string;
  question: string;
}

type PanelView = 'question' | 'yes_input' | 'success' | 'no_confirmed' | 'remind_later';

export default function OperationsAssistant() {
  const [reminders,      setReminders]      = useState<ReminderItem[]>([]);
  const [activeId,       setActiveId]       = useState<string | null>(null);
  const [visible,        setVisible]        = useState(false);
  const [panelView,      setPanelView]      = useState<PanelView>('question');
  const [chargeAmount,   setChargeAmount]   = useState('150');
  const [isSubmitting,   setIsSubmitting]   = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedTimer,  setSelectedTimer]  = useState<number | null>(null);

  const [isDocked, setIsDocked] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DOCKED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const assistantRef = useRef<HTMLDivElement>(null);

  // Listen for dock changes
  useEffect(() => {
    const handleDockChange = () => {
      try {
        const val = localStorage.getItem(DOCKED_KEY) === 'true';
        setIsDocked(val);
        if (!val) {
          setVisible(true);
          setPanelView('question');
        } else {
          setVisible(false);
        }
      } catch { /**/ }
    };
    window.addEventListener('mercon_assistant_dock_change', handleDockChange);
    return () => window.removeEventListener('mercon_assistant_dock_change', handleDockChange);
  }, []);

  const setDockState = (docked: boolean) => {
    setIsDocked(docked);
    try {
      localStorage.setItem(DOCKED_KEY, String(docked));
    } catch { /**/ }
    if (docked) setVisible(false);
    window.dispatchEvent(new CustomEvent('mercon_assistant_dock_change'));
  };

  // Draggable avatar position
  const [pos, setPos] = useState<{x:number; y:number}>(() => {
    try {
      const s = localStorage.getItem(POSITION_KEY);
      if (s) return JSON.parse(s);
    } catch { /**/ }
    return { x: 24, y: window.innerHeight - 80 };
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ sx:0, sy:0, ix:0, iy:0 });
  const movedRef = useRef(false);

  const savePos = (x: number, y: number) => {
    const cx = Math.min(Math.max(12, x), window.innerWidth  - 60);
    const cy = Math.min(Math.max(12, y), window.innerHeight - 60);
    setPos({ x:cx, y:cy });
    try { localStorage.setItem(POSITION_KEY, JSON.stringify({x:cx,y:cy})); } catch { /**/ }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    movedRef.current = false;
    dragRef.current = { sx:e.clientX, sy:e.clientY, ix:pos.x, iy:pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragRef.current.sx;
    const dy = e.clientY - dragRef.current.sy;
    if (Math.hypot(dx,dy) > 4) movedRef.current = true;
    setPos({ x: dragRef.current.ix + dx, y: dragRef.current.iy + dy });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    if (!movedRef.current && !visible) {
      setVisible(true);
      setPanelView('question');
    } else if (movedRef.current) {
      savePos(pos.x, pos.y);
    }
  };

  useEffect(() => {
    const fn = () => setPos((p) => ({
      x: Math.min(Math.max(12, p.x), window.innerWidth  - 60),
      y: Math.min(Math.max(12, p.y), window.innerHeight - 60),
    }));
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  // Close when touching/clicking outside
  useEffect(() => {
    if (!visible) return;
    const handleOutsideClick = (e: PointerEvent) => {
      if (assistantRef.current && !assistantRef.current.contains(e.target as Node)) {
        dismiss();
      }
    };
    const t = setTimeout(() => {
      document.addEventListener('pointerdown', handleOutsideClick);
    }, 50);
    return () => {
      clearTimeout(t);
      document.removeEventListener('pointerdown', handleOutsideClick);
    };
  }, [visible]);

  let currentAsset: AssetKey = 'question';
  if (reminders.length === 0) {
    currentAsset = 'great';
  } else {
    if (panelView === 'question') currentAsset = 'question';
    if (panelView === 'yes_input' || panelView === 'success' || panelView === 'no_confirmed') currentAsset = 'great';
    if (panelView === 'remind_later') currentAsset = 'remind_later';
  }

  const syncReminders = useCallback(async () => {
    try {
      const handledSet = new Set<string>(JSON.parse(localStorage.getItem(HANDLED_REMINDERS_KEY) || '[]'));
      const snoozedMap: Record<string,number> = JSON.parse(localStorage.getItem(SNOOZED_REMINDERS_KEY) || '{}');
      const now = Date.now();

      let trips: Trip[] = [];
      try {
        const res = await tripService.getAll({ status: 'Completed', per_page: 50 });
        trips = res.data || [];
      } catch { /* network unavailable */ }

      const pending: ReminderItem[] = [];
      trips.forEach((t) => {
        const rid = `labor-charge-${t.ref_id || t.id}`;
        if (handledSet.has(rid)) return;
        if (snoozedMap[rid] && snoozedMap[rid] > now) return;

        // Skip completed trips that already have charges logged
        const hasLabor = ((t as any).charges?.length ?? 0) > 0;
        if (hasLabor) return;

        pending.push({ id:rid, tripId:t.id, tripRef:t.ref_id||'TRP-0159',
          type:'labor_charge', title:`Trip ${t.ref_id||'TRP-0159'} completed`,
          question:'Was there any labor charge for this trip?' });
      });

      setReminders(pending);
      setActiveId((prev) => {
        if (pending.length === 0) return null;
        if (!prev || !pending.some((r) => r.id === prev)) return pending[0].id;
        return prev;
      });
    } catch(e) { console.error('assistant sync', e); }
  }, []);

  useEffect(() => {
    syncReminders();
    const t = setInterval(syncReminders, 60000);
    return () => clearInterval(t);
  }, [syncReminders]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  const activeReminder = reminders.find((r) => r.id === activeId) ?? reminders[0];

  const markHandled = (rid: string) => {
    try {
      const arr: string[] = JSON.parse(localStorage.getItem(HANDLED_REMINDERS_KEY) || '[]');
      if (!arr.includes(rid)) { arr.push(rid); localStorage.setItem(HANDLED_REMINDERS_KEY, JSON.stringify(arr)); }
    } catch { /**/ }
    setTimeout(syncReminders, 300);
  };

  const dismiss = () => {
    setVisible(false);
    setTimeout(() => { setPanelView('question'); setChargeAmount('150'); }, 500);
  };

  const handleYes = () => {
    setPanelView('yes_input');
  };

  const handleAddCharge = async () => {
    if (!activeReminder) return;
    const amount = parseFloat(chargeAmount) || 150;
    setIsSubmitting(true);
    try {
      await expenseService.create({ category:'Labor Charge', amount, status:'Paid',
        description:`Labor charge for completed trip ${activeReminder.tripRef}`, currency:'SAR' });
    } catch { /**/ }
    setSuccessMessage(`SAR ${amount.toFixed(2)} recorded for ${activeReminder.tripRef}`);
    setPanelView('success');
    markHandled(activeReminder.id);
    setIsSubmitting(false);
    setTimeout(dismiss, 2000);
  };

  const handleNo = () => {
    if (activeReminder) markHandled(activeReminder.id);
    setPanelView('no_confirmed');
    setTimeout(dismiss, 1800);
  };

  const handleRemindLater = () => {
    setPanelView('remind_later');
  };

  const handleConfirmTimer = (minutes: number) => {
    setSelectedTimer(minutes);
    if (activeReminder) {
      try {
        const map: Record<string,number> = JSON.parse(localStorage.getItem(SNOOZED_REMINDERS_KEY)||'{}');
        map[activeReminder.id] = Date.now() + minutes * 60000;
        localStorage.setItem(SNOOZED_REMINDERS_KEY, JSON.stringify(map));
      } catch { /**/ }
    }
    dismiss();
    setTimeout(syncReminders, 300);
  };

  if (isDocked) return null;

  return (
    <>
      <style>{`
        @keyframes bubblePop {
          0%  { transform:scale(0.82) translateY(8px); opacity:0 }
          65% { transform:scale(1.04) translateY(-3px); opacity:1 }
          100%{ transform:scale(1) translateY(0); opacity:1 }
        }
        @keyframes msgFade {
          0%  { opacity:0; transform:translateY(5px) }
          100%{ opacity:1; transform:translateY(0) }
        }
        @keyframes idleFloat {
          0%,100%{ transform:translateY(0px) }
          50%    { transform:translateY(-5px) }
        }
        .bubble-in  { animation:bubblePop 0.35s cubic-bezier(0.34,1.56,0.64,1) both }
        .msg-in     { animation:msgFade 0.25s ease both }
        .char-idle  { animation:idleFloat 3.6s ease-in-out infinite }
        .btn-hover  { transition:transform 0.16s ease, box-shadow 0.16s ease }
        .btn-hover:hover{ transform:translateY(-2px); box-shadow:0 5px 14px rgba(0,0,0,0.13) }
        .btn-hover:active{ transform:translateY(0) }
      `}</style>

      <div className="fixed inset-0 z-[60] pointer-events-none" aria-live="polite">
        {/* DRAGGABLE AVATAR BUTTON (shown when speech bubble is closed) */}
        {!visible && (
          <div
            style={{ position:'fixed', left:`${pos.x}px`, top:`${pos.y}px`, touchAction:'none', zIndex:70 }}
            className="pointer-events-auto relative group"
          >
            <button
              type="button"
              aria-label="Open Operations Assistant"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className={`w-16 h-16 rounded-full bg-white border-2 border-[#E8450F] shadow-2xl
                flex items-center justify-center p-0.5
                ring-4 ring-[#E8450F]/20
                hover:scale-105 active:scale-95 transition-transform
                ${isDragging ? 'cursor-grabbing scale-105' : 'cursor-grab'}`}
            >
              <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center">
                <img src={ASSETS.profile} alt="Operations Assistant" draggable={false} className="w-full h-full object-cover pointer-events-none select-none"/>
              </div>
              {reminders.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1.5 rounded-full bg-[#E8450F] border-2 border-white text-white text-[11px] font-black flex items-center justify-center shadow-md z-30 animate-pulse">
                  {reminders.length}
                </span>
              )}
            </button>

            {/* Quick Hide / Dock button attached to avatar */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setDockState(true); }}
              title="Hide floating assistant (Dock to Important Reminders)"
              className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-slate-800 hover:bg-charcoal-strong text-white text-[10px] font-black flex items-center justify-center shadow-md z-40 transition-all opacity-80 group-hover:opacity-100 cursor-pointer"
            >
              ↙
            </button>
          </div>
        )}

        {/* FULL ASSISTANT POPUP (HALF-BODY CHARACTER + SPEECH BUBBLE - DRAGGABLE via character) */}
        {visible && (
          <div
            ref={assistantRef}
            style={{
              position:'fixed',
              left:`${Math.max(12, Math.min(pos.x, window.innerWidth - 440))}px`,
              top:`${Math.max(12, Math.min(pos.y, window.innerHeight - 260))}px`,
              zIndex: 80,
            }}
            className="pointer-events-auto flex items-end gap-1 bubble-in"
          >
            {/* HALF-BODY CHARACTER IMAGE (DRAGGABLE HANDLE) */}
            <div
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              style={{ touchAction: 'none' }}
              className={`relative shrink-0 select-none z-10 w-36 sm:w-44 h-52 sm:h-60 -mr-2 transition-transform ${
                isDragging ? 'cursor-grabbing scale-105' : 'cursor-grab'
              }`}
            >
              <img
                src={ASSETS[currentAsset]}
                alt="Operations Assistant Character - Drag to move"
                draggable={false}
                className="w-full h-full object-contain object-bottom filter drop-shadow-md pointer-events-none select-none transition-all duration-200 char-idle"
              />
            </div>

            {/* SPEECH BUBBLE CARD */}
            <div className="relative mb-4 w-[340px] max-w-[calc(100vw-140px)]">
              {/* Pointer Triangle pointing left toward the character */}
              <span
                aria-hidden="true"
                style={{
                  position:'absolute',
                  left:'-10px',
                  bottom:'36px',
                  width:0, height:0,
                  borderTop:'10px solid transparent',
                  borderBottom:'10px solid transparent',
                  borderRight:'10px solid white',
                  filter:'drop-shadow(-2px 0px 1px rgba(0,0,0,0.06))',
                  zIndex:2,
                }}
              />

              <div className="relative bg-white rounded-2xl border border-slate-200 shadow-xl overflow-visible" style={{zIndex:1}}>
                {/* Header Action Buttons (Dock & Close) */}
                <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setDockState(true)}
                    aria-label="Hide and dock to Important Reminders"
                    title="Hide assistant & dock to Important Reminders"
                    className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <Minimize2 className="w-3 h-3"/>
                  </button>
                  <button
                    type="button"
                    onClick={dismiss}
                    aria-label="Dismiss"
                    className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5"/>
                  </button>
                </div>

                <div className="px-5 pt-4 pb-5 space-y-3.5">
                  {/* ZERO REMINDERS STATE */}
                  {reminders.length === 0 ? (
                    <div className="msg-in space-y-3">
                      <div className="space-y-1">
                        <p className="text-[15px] font-bold text-slate-900">Hey Ian!</p>
                        <p className="text-sm text-slate-700 leading-snug">
                          All caught up! No pending labor charges to add right now.
                        </p>
                        <p className="text-xs text-slate-500">
                          All completed trips have been processed.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={dismiss}
                        className="btn-hover w-full h-8.5 rounded-xl bg-charcoal hover:bg-slate-800 text-white text-xs font-bold shadow-xs cursor-pointer"
                      >
                        Great, thanks!
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* VIEW 1 — Question */}
                      {panelView === 'question' && (
                        <div className="msg-in space-y-3.5">
                          <div className="space-y-1">
                            <p className="text-[15px] font-bold text-slate-900">Hey Ian!</p>
                            <p className="text-sm text-slate-700 leading-snug">
                              Trip{' '}
                              <strong className="text-[#E8450F] font-bold">
                                {activeReminder?.tripRef ?? 'TRP-0159'}
                              </strong>{' '}
                              has been completed.
                            </p>
                            <p className="text-sm text-slate-800 font-medium">
                              {activeReminder?.question ?? 'Was there any labor charge for this trip?'}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <button type="button" onClick={handleYes}
                              className="btn-hover flex-1 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-sm cursor-pointer">
                              Yes
                            </button>
                            <button type="button" onClick={handleNo}
                              className="btn-hover flex-1 h-9 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-bold cursor-pointer">
                              No
                            </button>
                            <button type="button" onClick={handleRemindLater}
                              className="btn-hover flex-[1.6] h-9 rounded-xl border border-[#E8450F] bg-white hover:bg-orange-50 text-[#E8450F] text-sm font-semibold whitespace-nowrap cursor-pointer">
                              Remind Me Later
                            </button>
                          </div>
                        </div>
                      )}

                      {/* VIEW 2 — Enter amount */}
                      {panelView === 'yes_input' && (
                        <div className="msg-in space-y-3">
                          <button type="button" onClick={() => setPanelView('question')}
                            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-700 transition-colors cursor-pointer">
                            <ArrowLeft className="w-3 h-3"/> Back
                          </button>
                          <div>
                            <p className="text-sm font-bold text-slate-900">Great!</p>
                            <p className="text-xs text-slate-500 mt-0.5">Enter the labour charge amount:</p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {[50,100,150,200,500].map((v) => (
                              <button key={v} type="button" onClick={() => setChargeAmount(String(v))}
                                className={`btn-hover px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer
                                  ${chargeAmount===String(v)
                                    ? 'bg-[#E8450F] text-white border-[#E8450F]'
                                    : 'border-slate-200 text-slate-600 hover:border-[#E8450F]/40 hover:text-[#E8450F]'}`}>
                                {v} SAR
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">SAR</span>
                              <Input type="number" value={chargeAmount} onChange={(e) => setChargeAmount(e.target.value)}
                                placeholder="150" className="h-9 pl-11 rounded-xl text-xs font-bold border-slate-200 focus-visible:ring-[#E8450F]"/>
                            </div>
                            <button type="button" disabled={isSubmitting || !chargeAmount} onClick={handleAddCharge}
                              className="btn-hover h-9 px-4 rounded-xl bg-[#E8450F] hover:bg-[#d03d0c] disabled:opacity-60 text-white text-xs font-bold shrink-0 cursor-pointer">
                              {isSubmitting ? '...' : 'Add'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* VIEW 3 — Success */}
                      {panelView === 'success' && (
                        <div className="msg-in py-2 space-y-1">
                          <div className="flex items-center gap-1.5 text-emerald-600 font-bold text-xs">
                            <CheckCircle2 className="w-4 h-4 shrink-0"/>
                            <span>Labour charge recorded!</span>
                          </div>
                          <p className="text-sm font-extrabold text-slate-900">{successMessage}</p>
                        </div>
                      )}

                      {/* VIEW 4 — No confirmed */}
                      {panelView === 'no_confirmed' && (
                        <div className="msg-in py-2 space-y-1">
                          <p className="text-sm font-bold text-slate-800">Okay, got it!</p>
                          <p className="text-xs text-slate-500">No labour charge recorded for trip {activeReminder?.tripRef}.</p>
                        </div>
                      )}

                      {/* VIEW 5 — Remind me later */}
                      {panelView === 'remind_later' && (
                        <div className="msg-in space-y-2.5">
                          <div>
                            <p className="text-sm font-bold text-slate-900">When should I remind you?</p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              I'll check back about <strong>{activeReminder?.tripRef}</strong>.
                            </p>
                          </div>
                          <div className="grid grid-cols-4 gap-1.5">
                            {[{l:'1 min',v:1},{l:'5 min',v:5},{l:'15 min',v:15},{l:'1 hr',v:60}].map(({l,v}) => (
                              <button key={v} type="button" onClick={() => handleConfirmTimer(v)}
                                className={`btn-hover h-9 rounded-xl text-xs font-bold border transition-colors cursor-pointer
                                  ${selectedTimer===v
                                    ? 'bg-[#E8450F] text-[#ffffff] border-[#E8450F]'
                                    : 'border-slate-200 text-slate-700 hover:border-[#E8450F]/40 hover:text-[#E8450F]'}`}>
                                {l}
                              </button>
                            ))}
                          </div>
                          <p className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-[#E8450F] shrink-0"/> Snoozing reminder…
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
