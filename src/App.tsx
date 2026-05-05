/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  Play, 
  Check, 
  History, 
  ArrowRight, 
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Settings
} from 'lucide-react';

// --- Types ---

interface Step {
  id: string;
  title: string;
  options: string[];
  selectedIndices: number[];
  timestamp: number;
}

enum AppMode {
  CREATE = 'CREATE',
  CHOICE = 'CHOICE',
  HISTORY = 'HISTORY',
  SETTINGS = 'SETTINGS',
}

interface Timeline {
  id: string;
  steps: Step[];
}

// --- Components ---

/**
 * Helper to generate ID like 26May05-01
 */
const generateTimelineId = (existingTimelines: { id: string }[]) => {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[now.getMonth()];
  const day = now.getDate().toString().padStart(2, '0');
  const dateStr = `${year}${month}${day}`;
  
  const sameDayCount = existingTimelines.filter(t => t.id.startsWith(dateStr)).length;
  const seq = (sameDayCount + 1).toString().padStart(2, '0');
  
  return `${dateStr}-${seq}`;
};

/**
 * Auto-resizing text component to prevent truncation.
 * Scales font size based on text length and container width.
 */
const AutoResizingText: React.FC<{ text: string; className?: string; minSize?: number; maxSize?: number }> = ({ 
  text, 
  className = "", 
  minSize = 14, 
  maxSize = 32 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(maxSize);

  useEffect(() => {
    if (!containerRef.current) return;
    
    // Simple heuristic for font scaling
    const length = text.length;
    let newSize = maxSize;
    
    if (length > 20) newSize = Math.max(minSize, maxSize - (length - 20) * 0.5);
    
    setFontSize(newSize);
  }, [text, minSize, maxSize]);

  return (
    <div 
      ref={containerRef} 
      className={`w-full overflow-hidden break-words leading-tight ${className}`}
      style={{ fontSize: `${fontSize}px` }}
    >
      {text}
    </div>
  );
};

export default function App() {
  // --- State ---
  const [mode, setMode] = useState<AppMode>(AppMode.CREATE);
  const [activeSession, setActiveSession] = useState<Step[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [archivedSessions, setArchivedSessions] = useState<Timeline[]>([]);
  const [clientName, setClientName] = useState("");
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentOptions, setCurrentOptions] = useState<string[]>(["", ""]);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [confirmingBranch, setConfirmingBranch] = useState<{ sIdx: number, stIdx: number } | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<number | 'active' | null>(null);

  // Initialize from localStorage if available
  useEffect(() => {
    const savedActive = localStorage.getItem('choice-board-active');
    const savedArchived = localStorage.getItem('choice-board-archived');
    const savedClient = localStorage.getItem('choice-board-client');
    const savedActiveId = localStorage.getItem('choice-board-active-id');
    
    if (savedActive) {
      try { setActiveSession(JSON.parse(savedActive)); } catch (e) { console.error(e); }
    }
    if (savedArchived) {
      try { 
        const parsed = JSON.parse(savedArchived);
        // Migration check
        if (parsed.length > 0 && Array.isArray(parsed[0])) {
          setArchivedSessions(parsed.map((steps: Step[], i: number) => ({ id: `legacy-${i}`, steps })));
        } else {
          setArchivedSessions(parsed);
        }
      } catch (e) { console.error(e); }
    }
    if (savedClient) setClientName(savedClient);
    if (savedActiveId) {
      setActiveSessionId(savedActiveId);
    } else {
      setActiveSessionId(generateTimelineId([]));
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('choice-board-active', JSON.stringify(activeSession));
    localStorage.setItem('choice-board-archived', JSON.stringify(archivedSessions));
    localStorage.setItem('choice-board-client', clientName);
    localStorage.setItem('choice-board-active-id', activeSessionId);
  }, [activeSession, archivedSessions, clientName, activeSessionId]);

  // --- Handlers ---

  const addOptionField = () => {
    setCurrentOptions([...currentOptions, ""]);
  };

  const updateOptionText = (index: number, text: string) => {
    const newOptions = [...currentOptions];
    newOptions[index] = text;
    setCurrentOptions(newOptions);
  };

  const removeOptionField = (index: number) => {
    if (currentOptions.length <= 1) return;
    const newOptions = currentOptions.filter((_, i) => i !== index);
    setCurrentOptions(newOptions);
  };

  const startChoiceMode = () => {
    if (currentOptions.filter(o => o.trim()).length === 0) return;
    setSelectedIndices([]);
    setMode(AppMode.CHOICE);
  };

  const finalizeChoice = () => {
    const validOptions = currentOptions.map(o => o.trim()).filter(o => o !== "");
    const selectedTexts = selectedIndices.map(idx => currentOptions[idx]).filter(t => t.trim() !== "");
    
    const newStep: Step = {
      id: `step-${Date.now()}`,
      title: currentTitle || "Prompt",
      options: currentOptions.filter(o => o.trim() !== ""),
      selectedIndices: [...selectedIndices],
      timestamp: Date.now()
    };

    const nextSteps = [...activeSession, newStep];
    setActiveSession(nextSteps);
    
    // Prepare next step
    const nextTitle = selectedTexts.join(", ");
    setCurrentTitle(nextTitle);
    setCurrentOptions(["", ""]);
    setSelectedIndices([]);
    setMode(AppMode.CREATE);
  };

  const toggleChoice = (index: number) => {
    if (selectedIndices.includes(index)) {
      setSelectedIndices(selectedIndices.filter(i => i !== index));
    } else {
      setSelectedIndices([...selectedIndices, index]);
    }
  };

  const branchFromStep = (sIdx: number, stIdx: number) => {
    const targetSteps = sIdx === -1 ? activeSession : archivedSessions[sIdx].steps;
    const step = targetSteps[stIdx];
    
    // Archive current active session if it has steps
    if (activeSession.length > 0) {
      setArchivedSessions([{ id: activeSessionId, steps: activeSession }, ...archivedSessions]);
    }

    // Generate new ID for the new branch
    const newId = generateTimelineId([...archivedSessions, { id: activeSessionId }]);
    setActiveSessionId(newId);

    const newPrefix = targetSteps.slice(0, stIdx);
    setActiveSession(newPrefix);

    setCurrentTitle(step.title);
    const options = [...step.options];
    while (options.length < 2) options.push("");
    setCurrentOptions(options);

    setMode(AppMode.CREATE);
    setConfirmingBranch(null);
  };

  const handleResetSession = () => {
    if (activeSession.length > 0) {
      setArchivedSessions([{ id: activeSessionId, steps: activeSession }, ...archivedSessions]);
    }
    const newId = generateTimelineId([...archivedSessions, { id: activeSessionId }]);
    setActiveSessionId(newId);
    setActiveSession([]);
    setCurrentTitle("");
    setCurrentOptions(["", ""]);
    setSelectedIndices([]);
    setMode(AppMode.CREATE);
    setConfirmingReset(false);
  };

  const deleteTimeline = (sIdx: number | 'active') => {
    if (sIdx === 'active') {
      setActiveSession([]);
    } else {
      setArchivedSessions(archivedSessions.filter((_, i) => i !== sIdx));
    }
    setConfirmingDelete(null);
  };

  // --- Render Helpers ---

  const renderCreateMode = () => (
    <motion.div 
      key="create"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex flex-col h-full bg-white text-gray-900"
    >
      <header className="p-6 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
        <div>
          <h1 className="text-sm font-bold tracking-widest text-gray-400 uppercase">Step {activeSession.length + 1}</h1>
          <p className="text-[10px] text-gray-400 font-mono">{activeSessionId}</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setMode(AppMode.SETTINGS)}
            className="p-2 text-gray-400 hover:bg-gray-50 rounded-full transition-colors"
            title="Settings"
          >
            <Settings size={20} />
          </button>
          {(activeSession.length > 0 || archivedSessions.length > 0) && (
            <button 
              onClick={() => setMode(AppMode.HISTORY)}
              className="p-2 text-gray-500 hover:bg-gray-50 rounded-full transition-colors"
              title="Session History"
            >
              <History size={20} />
            </button>
          )}
          <button 
            onClick={() => setConfirmingReset(true)}
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
            title="Reset Session"
          >
            <RotateCcw size={20} />
          </button>
        </div>
      </header>

      {confirmingReset && (
        <div className="absolute inset-0 z-50 bg-white/98 flex flex-col items-center justify-center p-8 text-center space-y-6">
          <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center">
            <RotateCcw size={40} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Start New Timeline?</h2>
            <p className="text-gray-500 mt-2">The current timeline ({activeSessionId}) will be saved to history.</p>
          </div>
          <div className="flex flex-col w-full gap-3">
            <button 
              onClick={handleResetSession}
              className="w-full py-4 bg-red-500 text-white rounded-2xl font-bold text-lg shadow-lg shadow-red-200"
            >
              YES, START NEW
            </button>
            <button 
              onClick={() => setConfirmingReset(false)}
              className="w-full py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold"
            >
              CANCEL
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-6 space-y-6 pb-32">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 px-1">Prompt Title</label>
          <input
            type="text"
            value={currentTitle}
            onChange={(e) => setCurrentTitle(e.target.value)}
            placeholder="e.g., What would you like to do?"
            className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-gray-200 text-lg font-medium transition-all"
          />
        </div>

        <div className="space-y-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 px-1">Options</label>
          <AnimatePresence mode="popLayout">
            {currentOptions.map((opt, idx) => (
              <motion.div 
                key={idx}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex gap-2 items-center"
              >
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => updateOptionText(idx, e.target.value)}
                    placeholder={`Option ${idx + 1}`}
                    className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-gray-200 text-lg transition-all"
                  />
                </div>
                {currentOptions.length > 1 && (
                  <button 
                    onClick={() => removeOptionField(idx)}
                    className="p-4 text-gray-300 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          
          <button 
            onClick={addOptionField}
            className="w-full p-4 border-2 border-dashed border-gray-200 text-gray-400 rounded-2xl hover:border-gray-300 hover:text-gray-500 transition-all flex items-center justify-center gap-2 font-medium"
          >
            <Plus size={20} />
            <span>Add Option</span>
          </button>
        </div>
      </main>

      <footer className="p-6 bg-white border-t border-gray-100 fixed bottom-0 w-full max-w-md mx-auto left-0 right-0">
        <button 
          onClick={startChoiceMode}
          disabled={currentOptions.filter(o => o.trim()).length === 0}
          className={`w-full py-5 rounded-2xl flex items-center justify-center gap-2 font-bold text-lg transition-all shadow-xl active:scale-95 ${
            currentOptions.filter(o => o.trim()).length > 0 
              ? 'bg-gray-900 text-white hover:bg-black' 
              : 'bg-gray-100 text-gray-300 cursor-not-allowed shadow-none'
          }`}
        >
          <Play size={20} />
          START {clientName ? clientName.toUpperCase() : "CLIENT"} CHOICE
        </button>
      </footer>
    </motion.div>
  );

  const renderChoiceMode = () => {
    const validOptions = currentOptions.filter(o => o.trim() !== "");
    
    return (
      <motion.div 
        key="choice"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="flex flex-col h-full bg-gray-50 text-gray-900"
      >
        <header className="p-8 pt-12 text-center bg-white border-b border-gray-100 mb-4 rounded-b-3xl shadow-sm">
          <AutoResizingText 
            text={currentTitle || "Please choose:"} 
            className="font-bold text-gray-800" 
            maxSize={36} 
          />
          <div className="mt-2 text-[10px] font-black text-blue-500 tracking-[0.2em] uppercase">
            {clientName || "Client View"}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 space-y-4 pb-32">
          {validOptions.map((opt, idx) => {
            const originalIndex = currentOptions.indexOf(opt);
            const isSelected = selectedIndices.includes(originalIndex);
            
            return (
              <motion.button
                key={`${opt}-${idx}`}
                whileTap={{ scale: 0.98 }}
                onClick={() => toggleChoice(originalIndex)}
                className={`w-full min-h-[100px] p-6 rounded-3xl flex items-center gap-6 transition-all border-4 text-left shadow-md ${
                  isSelected 
                    ? 'bg-blue-600 border-blue-600 text-white shadow-blue-200' 
                    : 'bg-white border-transparent text-gray-700'
                }`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border-4 flex-shrink-0 transition-colors ${
                  isSelected ? 'bg-white border-white' : 'border-gray-200'
                }`}>
                  {isSelected && <Check size={32} className="text-blue-600 font-black" strokeWidth={4} />}
                </div>
                <div className="flex-1">
                  <AutoResizingText 
                    text={opt} 
                    className={`font-semibold leading-tight ${isSelected ? 'text-white' : 'text-gray-800'}`} 
                    maxSize={28}
                  />
                </div>
              </motion.button>
            );
          })}
        </main>

        <footer className="p-6 bg-transparent fixed bottom-0 w-full max-w-md mx-auto left-0 right-0 pointer-events-none">
          <button 
            onClick={finalizeChoice}
            className={`w-full py-6 rounded-3xl shadow-2xl flex items-center justify-center gap-2 font-black text-2xl transition-all pointer-events-auto active:scale-90 ${
              selectedIndices.length > 0 
                ? 'bg-green-500 text-white hover:bg-green-600 shadow-green-200' 
                : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
            }`}
          >
            DONE
          </button>
        </footer>
      </motion.div>
    );
  };

  const renderHistoryMode = () => (
    <motion.div 
      key="history"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="flex flex-col h-full bg-white text-gray-900"
    >
      <header className="p-6 border-b border-gray-100 flex items-center bg-white sticky top-0 z-10">
        <button 
          onClick={() => setMode(AppMode.CREATE)}
          className="p-2 mr-2 text-gray-500 hover:bg-gray-50 rounded-full transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-800">History</h1>
          <p className="text-xs text-gray-400">
            {activeSession.length + archivedSessions.reduce((acc, s) => acc + s.length, 0)} total steps across {archivedSessions.length + (activeSession.length > 0 ? 1 : 0)} timelines
          </p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 space-y-12 pb-24">
        {activeSession.length === 0 && archivedSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-300 space-y-4">
            <History size={64} strokeWidth={1} />
            <p>No steps yet.</p>
          </div>
        ) : (
          <div className="space-y-12">
            {/* Active Timeline */}
            <section className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${activeSession.length > 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                  <h2 className="text-xs font-black uppercase tracking-widest text-gray-600">Active: {activeSessionId}</h2>
                </div>
                {activeSession.length > 0 && (
                  <button 
                    onClick={() => setConfirmingDelete('active')}
                    className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              {activeSession.length === 0 && <p className="text-xs text-gray-300 italic px-8">No steps in current timeline.</p>}
              {activeSession.map((step, idx) => renderHistoryStep(step, idx, -1))}
            </section>

            {/* Archived Sessions */}
            {archivedSessions.map((session, sIdx) => (
              <section key={`session-${sIdx}`} className="space-y-4 opacity-70 hover:opacity-100 transition-opacity">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gray-300" />
                    <h2 className="text-xs font-black uppercase tracking-widest text-gray-400">Past: {session.id}</h2>
                  </div>
                  <button 
                    onClick={() => setConfirmingDelete(sIdx)}
                    className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {session.steps.map((step, idx) => renderHistoryStep(step, idx, sIdx))}
              </section>
            ))}
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {confirmingDelete !== null && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 flex items-end p-4"
          >
            <motion.div 
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="w-full bg-white rounded-3xl p-8 space-y-6"
            >
              <div className="text-center">
                <h3 className="text-xl font-bold text-gray-900">Delete Timeline?</h3>
                <p className="text-gray-500 mt-2">This will permanently remove this timeline and all its steps.</p>
              </div>
              <div className="flex flex-col gap-2">
                <button 
                  onClick={() => deleteTimeline(confirmingDelete)}
                  className="w-full py-4 bg-red-500 text-white rounded-2xl font-bold"
                >
                  DELETE PERMANENTLY
                </button>
                <button 
                  onClick={() => setConfirmingDelete(null)}
                  className="w-full py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold"
                >
                  CANCEL
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );

  const renderSettingsMode = () => (
    <motion.div 
      key="settings"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="flex flex-col h-full bg-white text-gray-900"
    >
      <header className="p-6 border-b border-gray-100 flex items-center bg-white sticky top-0 z-10">
        <button 
          onClick={() => setMode(AppMode.CREATE)}
          className="p-2 mr-2 text-gray-500 hover:bg-gray-50 rounded-full transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-lg font-bold text-gray-800">Settings</h1>
      </header>

      <main className="flex-1 p-6 space-y-8">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Client Profile</label>
            <p className="text-[10px] text-gray-400 leading-normal">
              Enter the client's name or initials. This will replace "Client View" in the choice mode to make it more personal.
            </p>
          </div>
          <input
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="e.g., Alex Johnson"
            className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-100 text-lg font-medium transition-all"
          />
        </div>

        <div className="pt-8 border-t border-gray-50 space-y-4">
          <label className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">About Choice Board</label>
          <p className="text-xs text-gray-500 leading-relaxed">
            A minimalist tool for therapists to scaffold conversations and choices. Sessions are saved locally in your browser and are not sent to any server.
          </p>
        </div>
      </main>

      <footer className="p-6">
        <button 
          onClick={() => setMode(AppMode.CREATE)}
          className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-100 active:scale-95 transition-all"
        >
          SAVE & CONTINUE
        </button>
      </footer>
    </motion.div>
  );

  const renderHistoryStep = (step: Step, idx: number, sIdx: number) => (
    <div key={step.id} className="relative pl-8 border-l-2 border-gray-100 py-2">
      <div className={`absolute left-[-9px] top-4 w-4 h-4 rounded-full border-2 ${sIdx === -1 ? 'bg-green-50 border-green-500' : 'bg-gray-100 border-gray-300'}`} />
      <div className="bg-gray-50 p-4 rounded-2xl space-y-2 relative overflow-hidden group">
        {confirmingBranch?.sIdx === sIdx && confirmingBranch?.stIdx === idx && (
          <div className="absolute inset-0 z-10 bg-blue-600 text-white p-4 flex flex-col justify-center items-center text-center space-y-3">
            <p className="text-xs font-bold uppercase tracking-tight">Branch from here into a new timeline?</p>
            <div className="flex gap-2 w-full">
              <button 
                onClick={() => branchFromStep(sIdx, idx)}
                className="flex-1 bg-white text-blue-600 py-2 rounded-xl text-xs font-bold"
              >
                YES
              </button>
              <button 
                onClick={() => setConfirmingBranch(null)}
                className="flex-1 bg-blue-700 text-white py-2 rounded-xl text-xs font-bold"
              >
                NO
              </button>
            </div>
          </div>
        )}
        <div className="flex justify-between items-start mb-2">
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Step {idx + 1}</h3>
            <p className="font-semibold text-gray-700">{step.title}</p>
          </div>
          <button 
            onClick={() => setConfirmingBranch({ sIdx, stIdx: idx })}
            className="flex items-center gap-1 px-3 py-1 bg-white border border-gray-200 rounded-full text-[10px] font-bold text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-all uppercase tracking-tighter"
          >
            <ArrowRight size={10} />
            Branch
          </button>
        </div>
        
        <div className="flex flex-wrap gap-2 pt-1">
          {step.selectedIndices.map(siIdx => (
            <span key={siIdx} className="bg-white border border-gray-200 px-3 py-1 rounded-full text-xs font-medium text-blue-600 flex items-center gap-1">
              <Check size={10} />
              {step.options[siIdx]}
            </span>
          ))}
        </div>
        <div className="mt-3 flex justify-between items-center opacity-40">
          <span className="text-[10px] font-mono">
            {new Date(step.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 font-sans selection:bg-blue-100">
      {/* Mobile container constraint */}
      <div className="max-w-md mx-auto bg-white min-h-screen shadow-2xl relative overflow-hidden flex flex-col">
        <AnimatePresence mode="wait">
          {mode === AppMode.CREATE && renderCreateMode()}
          {mode === AppMode.CHOICE && renderChoiceMode()}
          {mode === AppMode.HISTORY && renderHistoryMode()}
          {mode === AppMode.SETTINGS && renderSettingsMode()}
        </AnimatePresence>
      </div>
    </div>
  );
}
