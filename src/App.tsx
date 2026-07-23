import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, FileText, LockKeyhole, Maximize, ShieldCheck, WifiOff } from 'lucide-react';
import { auth, db, signInExamStudent } from './firebase';
import { questions, validateQuestionBank } from './questions';

type Phase = 'ready' | 'exam' | 'result';
type Result = { score: number; answered: number; violations: string[]; submittedAt: Date; saved: boolean };
type AdminAttempt = { id: string; score: number; total: number; answered: number; durationSeconds: number; violations: string[]; submittedAtIso?: string; studentId?: string };
const EXAM_SECONDS = 60 * 60;
const ADMIN_PASSCODE = import.meta.env.VITE_ADMIN_PASSCODE ?? 'VU-CS101-ADMIN';

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 3600)).padStart(2, '0')}:${String(Math.floor((safe % 3600) / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function ReadyScreen({ studentReady, error, onStart, onAdmin }: { studentReady: boolean; error: string; onStart: () => void; onAdmin: () => void }) {
  return <main className="shell"><section className="landing card"><div className="brand-mark"><FileText size={22} /></div><p className="eyebrow">VIRTUAL UNIVERSITY • CS101</p><h1>Final Examination</h1><p className="lede">Introduction to Computing · Modules 82–234</p><div className="exam-specs"><div><Clock3 /><span><strong>60 minutes</strong><small>Fixed exam duration</small></span></div><div><FileText /><span><strong>50 MCQs</strong><small>Four choices each</small></span></div><div><LockKeyhole /><span><strong>Strict mode</strong><small>No backtracking or feedback</small></span></div></div><div className="rules"><div className="rules-heading"><ShieldCheck size={18} /> Before you begin</div><ul><li>Fullscreen is required and leaving the tab ends the exam.</li><li>Questions are forward-only. Answers cannot be changed.</li><li>Results are revealed only after submission.</li><li>A warning appears when a detectable exam rule is broken.</li></ul></div>{error && <div className="notice error"><AlertTriangle size={17} />{error}</div>}<button className="primary start" onClick={onStart} disabled={!studentReady && !error}>Start secure exam <ArrowRight size={18} /></button><button className="admin-link" onClick={onAdmin}>Admin panel</button><p className="fineprint">One student session · Attempt saved securely when Firebase is available</p></section></main>;
}

function ResultScreen({ result }: { result: Result }) {
  const percentage = result.score * 2;
  return <main className="shell"><section className="result card"><div className="result-icon"><CheckCircle2 /></div><p className="eyebrow">EXAM SUBMITTED</p><h1>Examination complete</h1><div className="score"><strong>{result.score}<small>/ 50</small></strong><span>{percentage}%</span></div><p className="result-message">{percentage >= 50 ? 'You have passed this attempt.' : 'This attempt did not reach the 50% passing mark.'}</p><div className="result-grid"><div><span>Answered</span><strong>{result.answered} / 50</strong></div><div><span>Submitted</span><strong>{result.submittedAt.toLocaleTimeString()}</strong></div><div><span>Record</span><strong>{result.saved ? 'Saved to Firebase' : 'Local result only'}</strong></div></div>{result.violations.length > 0 && <div className="notice warning"><AlertTriangle size={17} /><span><strong>Exam violations recorded:</strong> {result.violations.join(', ')}.</span></div>}<p className="fineprint">Correct answers are intentionally not displayed in student mode.</p></section></main>;
}

function AdminPanel({ onBack }: { onBack: () => void }) {
  const [passcode, setPasscode] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [attempts, setAttempts] = useState<AdminAttempt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const unlock = async () => {
    if (passcode !== ADMIN_PASSCODE) { setError('Incorrect admin passcode.'); return; }
    setError(''); setUnlocked(true); setLoading(true);
    try {
      const snapshot = await getDocs(query(collection(db, 'adminAttempts'), orderBy('submittedAtIso', 'desc')));
      setAttempts(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<AdminAttempt, 'id'>) })));
    } catch { setError('Could not load results. Check Firebase Anonymous Auth and Firestore rules.'); }
    finally { setLoading(false); }
  };
  if (!unlocked) return <main className="shell"><section className="landing card admin-card"><div className="brand-mark"><LockKeyhole size={22} /></div><p className="eyebrow">ADMIN ACCESS</p><h1>Results panel</h1><p className="lede">Review submitted CS101 attempts.</p><input className="admin-input" type="password" placeholder="Admin passcode" value={passcode} onChange={(event) => setPasscode(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void unlock(); }} />{error && <div className="notice error"><AlertTriangle size={17} />{error}</div>}<button className="primary start" onClick={() => void unlock()}>Open results</button><button className="admin-link" onClick={onBack}>Back to exam</button></section></main>;
  return <main className="shell"><section className="admin-results card"><div className="admin-top"><div><p className="eyebrow">ADMIN ACCESS</p><h1>Exam results</h1></div><button className="admin-link" onClick={onBack}>Back to exam</button></div>{loading ? <p className="lede">Loading results…</p> : attempts.length === 0 ? <div className="empty-state">No submitted attempts yet.</div> : <div className="results-table"><div className="table-row table-head"><span>Student</span><span>Score</span><span>Answered</span><span>Time</span><span>Rule status</span></div>{attempts.map((attempt) => <div className="table-row" key={attempt.id}><span className="mono">{attempt.studentId?.slice(0, 10) ?? 'Unknown'}</span><strong>{attempt.score} / {attempt.total}</strong><span>{attempt.answered} / {attempt.total}</span><span>{Math.floor((attempt.durationSeconds ?? 0) / 60)}m</span><span className={attempt.violations?.length ? 'bad' : 'good'}>{attempt.violations?.length ? `${attempt.violations.length} violation(s)` : 'Clean'}</span></div>)}</div>}{error && <div className="notice error"><AlertTriangle size={17} />{error}</div>}<p className="fineprint">Admin access uses the configured passcode. Use Firebase custom claims for stronger production security.</p></section></main>;
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('ready');
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [secondsLeft, setSecondsLeft] = useState(EXAM_SECONDS);
  const [violations, setViolations] = useState<string[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [studentReady, setStudentReady] = useState(false);
  const [adminOpen, setAdminOpen] = useState(() => new URLSearchParams(window.location.search).get('admin') === '1');
  const [violationWarning, setViolationWarning] = useState('');
  const startedAt = useRef<Date | null>(null);
  const submitted = useRef(false);
  const answerRef = useRef(answers);
  const violationRef = useRef(violations);
  const phaseRef = useRef(phase);

  useEffect(() => { validateQuestionBank(); }, []);
  useEffect(() => { answerRef.current = answers; }, [answers]);
  useEffect(() => { violationRef.current = violations; }, [violations]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  useEffect(() => {
    signInExamStudent().then(() => setStudentReady(true)).catch(() => setError('Firebase sign-in is unavailable. The exam can still run, but the attempt may not be saved.'));
  }, []);

  const recordViolation = useCallback((reason: string) => {
    setViolations((previous) => previous.includes(reason) ? previous : [...previous, reason]);
  }, []);

  const submitExam = useCallback(async (reason?: string) => {
    if (submitted.current || phaseRef.current !== 'exam') return;
    submitted.current = true;
    if (reason) recordViolation(reason);
    const finalViolations = reason && !violationRef.current.includes(reason) ? [...violationRef.current, reason] : violationRef.current;
    const selectedAnswers = answerRef.current;
    const score = questions.reduce((total, question) => total + (selectedAnswers[question.id] === question.answer ? 1 : 0), 0);
    let saved = false;
    try {
      if (auth.currentUser) {
        const submittedAtIso = new Date().toISOString();
        await addDoc(collection(db, 'users', auth.currentUser.uid, 'attempts'), {
          score,
          total: questions.length,
          answered: Object.keys(selectedAnswers).length,
          durationSeconds: startedAt.current ? Math.round((Date.now() - startedAt.current.getTime()) / 1000) : EXAM_SECONDS,
          violations: finalViolations,
          selectedAnswers,
          submittedAt: serverTimestamp(),
          submittedAtIso,
        });
        await addDoc(collection(db, 'adminAttempts'), {
          score,
          total: questions.length,
          answered: Object.keys(selectedAnswers).length,
          durationSeconds: startedAt.current ? Math.round((Date.now() - startedAt.current.getTime()) / 1000) : EXAM_SECONDS,
          violations: finalViolations,
          studentId: auth.currentUser.uid,
          submittedAt: serverTimestamp(),
          submittedAtIso,
        });
        saved = true;
      }
    } catch { setError('Your result is shown below, but Firebase could not save this attempt.'); }
    setViolationWarning('');
    setResult({ score, answered: Object.keys(selectedAnswers).length, violations: finalViolations, submittedAt: new Date(), saved });
    setPhase('result');
    document.exitFullscreen?.();
  }, [recordViolation]);

  const warnAndSubmit = useCallback((reason: string) => {
    if (submitted.current || phaseRef.current !== 'exam') return;
    recordViolation(reason);
    setViolationWarning(reason);
    window.setTimeout(() => void submitExam(reason), 2500);
  }, [recordViolation, submitExam]);

  useEffect(() => {
    if (phase !== 'exam') return;
    const timer = window.setInterval(() => setSecondsLeft((value) => {
      if (value <= 1) { void submitExam('Time expired'); return 0; }
      return value - 1;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [phase, submitExam]);

  useEffect(() => {
    if (phase !== 'exam') return;
    const onVisibility = () => { if (document.hidden) warnAndSubmit('Left the exam tab'); };
    const onBlur = () => warnAndSubmit('Browser focus lost');
    const onFullscreen = () => { if (!document.fullscreenElement) warnAndSubmit('Fullscreen exited'); };
    const onContext = (event: MouseEvent) => event.preventDefault();
    const onDrag = (event: DragEvent) => event.preventDefault();
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const blocked = event.key === 'PrintScreen' || (event.ctrlKey && ['p', 'c', 's', 'u'].includes(key)) || (event.metaKey && ['p', 'c', 's', 'u'].includes(key)) || (event.ctrlKey && event.shiftKey && ['i', 'j', 'c'].includes(key));
      if (blocked) { event.preventDefault(); warnAndSubmit('Restricted screenshot or browser shortcut'); }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('contextmenu', onContext);
    document.addEventListener('dragstart', onDrag);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('blur', onBlur); document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('contextmenu', onContext); document.removeEventListener('dragstart', onDrag); window.removeEventListener('beforeunload', onBeforeUnload); window.removeEventListener('keydown', onKey);
    };
  }, [phase, warnAndSubmit]);

  const startExam = async () => {
    setError('');
    try {
      await document.documentElement.requestFullscreen?.();
    } catch { setError('Fullscreen permission is required to begin the exam. Please allow it and try again.'); return; }
    submitted.current = false; startedAt.current = new Date(); setSecondsLeft(EXAM_SECONDS); setCurrent(0); setAnswers({}); setViolations([]); setResult(null); setPhase('exam');
  };

  const selectAnswer = (choice: number) => setAnswers((previous) => ({ ...previous, [questions[current].id]: choice }));
  const progress = useMemo(() => Math.round(((current + 1) / questions.length) * 100), [current]);

  if (phase === 'ready' && adminOpen) return <AdminPanel onBack={() => setAdminOpen(false)} />;
  if (String(phase) === 'ready') return <ReadyScreen studentReady={studentReady} error={error} onStart={startExam} onAdmin={() => setAdminOpen(true)} />;
  if (phase === 'result' && result) return <ResultScreen result={result} />;

  if (phase === 'ready') return <main className="shell"><section className="landing card"><div className="brand-mark"><FileText size={22} /></div><p className="eyebrow">VIRTUAL UNIVERSITY • CS101</p><h1>Final Examination</h1><p className="lede">Introduction to Computing · Modules 82–234</p><div className="exam-specs"><div><Clock3 /><span><strong>120 minutes</strong><small>Fixed exam duration</small></span></div><div><FileText /><span><strong>100 MCQs</strong><small>Four choices each</small></span></div><div><LockKeyhole /><span><strong>Strict mode</strong><small>No backtracking or feedback</small></span></div></div><div className="rules"><div className="rules-heading"><ShieldCheck size={18} /> Before you begin</div><ul><li>Fullscreen is required and leaving the tab ends the exam.</li><li>Questions are forward-only. Answers cannot be changed.</li><li>Results are revealed only after submission.</li><li>Screenshot and browser shortcut controls are blocked where detectable.</li></ul></div>{error && <div className="notice error"><AlertTriangle size={17} />{error}</div>}<button className="primary start" onClick={startExam} disabled={!studentReady && !error}>Start secure exam <ArrowRight size={18} /></button><p className="fineprint">One student session · Attempt saved securely when Firebase is available</p></section></main>;

  if (phase === 'result' && result) {
    const percentage = result.score;
    return <main className="shell"><section className="result card"><div className="result-icon"><CheckCircle2 /></div><p className="eyebrow">EXAM SUBMITTED</p><h1>Examination complete</h1><div className="score"><strong>{result.score}<small>/ 100</small></strong><span>{percentage}%</span></div><p className="result-message">{percentage >= 50 ? 'You have passed this attempt.' : 'This attempt did not reach the 50% passing mark.'}</p><div className="result-grid"><div><span>Answered</span><strong>{result.answered} / 100</strong></div><div><span>Submitted</span><strong>{result.submittedAt.toLocaleTimeString()}</strong></div><div><span>Record</span><strong>{result.saved ? 'Saved to Firebase' : 'Local result only'}</strong></div></div>{result.violations.length > 0 && <div className="notice warning"><AlertTriangle size={17} /><span><strong>Exam violations recorded:</strong> {result.violations.join(', ')}.</span></div>}<p className="fineprint">Correct answers are intentionally not displayed in student mode.</p></section></main>;
  }

  const question = questions[current];
  const selected = answers[question.id];
  return <main className="exam-shell"><header className="exam-header"><div className="exam-title"><div className="brand-mark small"><FileText size={17} /></div><div><strong>CS101 Final Examination</strong><span>Modules 82–234 · Secure session</span></div></div><div className={`timer ${secondsLeft < 600 ? 'urgent' : ''}`}><Clock3 size={18} /><span>{formatTime(secondsLeft)}</span></div></header><div className="watermark">CS101 • {auth.currentUser?.uid.slice(0, 8) ?? 'STUDENT'}</div><section className="exam-content"><div className="exam-meta"><span>Question {current + 1} of {questions.length}</span><span>{progress}% complete</span></div><div className="progress-track"><div style={{ width: `${progress}%` }} /></div><article className="question-card"><div className="question-number">Q{String(current + 1).padStart(2, '0')}</div><h1>{question.prompt}</h1><div className="options">{question.options.map((option, index) => <button className={`option ${selected === index ? 'selected' : ''}`} key={option} onClick={() => selectAnswer(index)}><span className="option-key">{String.fromCharCode(65 + index)}</span><span>{option}</span></button>)}</div></article><div className="exam-footer"><span className="no-back"><LockKeyhole size={15} /> Forward-only exam</span>{current === questions.length - 1 ? <button className="submit-button" onClick={() => void submitExam()}>Submit exam <CheckCircle2 size={17} /></button> : <button className="next-button" disabled={selected === undefined} onClick={() => setCurrent((value) => value + 1)}>Next question <ArrowRight size={17} /></button>}</div>{error && <div className="notice error"><WifiOff size={17} />{error}</div>}</section></main>;
}
