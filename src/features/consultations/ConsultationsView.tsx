"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/format";

type Consultation = {
  id: number;
  consultationNumber: string;
  patientId: number;
  patientName: string;
  patientNumber: string;
  patientPhone: string;
  consultationDate: string;
  consultationTime: string;
  consultationType: string;
  notes: string | null;
  source: "appointment" | "clinical";
  diagnosis: string | null;
  anamnesis: string | null;
  treatment: string | null;
  recommendations: string | null;
  nextAppointmentDate: string | null;
  status: string;
  practitioner: string;
  recordings: Recording[];
};

type Recording = {
  id: number;
  mimeType: string;
  sizeBytes: number;
  durationMs: number;
  createdAt: string;
};

type Summary = { total: number; patients: number; upcoming: number; completed: number };

const statusLabels: Record<string, [string, string]> = {
  PENDING: ["En attente", "في الانتظار"],
  CONFIRMED: ["Confirmée", "مؤكدة"],
  ARRIVED: ["Arrivé", "وصل"],
  IN_CONSULTATION: ["En consultation", "في الاستشارة"],
  COMPLETED: ["Terminée", "مكتملة"],
};

export function ConsultationsView() {
  const { locale, t } = useI18n();
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, patients: 0, upcoming: 0, completed: 0 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/consultations", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Chargement impossible.");
        if (active) {
          setConsultations(body.data);
          setSummary(body.summary ?? { total: 0, patients: 0, upcoming: 0, completed: 0 });
        }
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Chargement impossible.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return consultations;
    return consultations.filter((item) =>
      [item.patientName, item.patientNumber, item.patientPhone, item.consultationNumber, item.practitioner]
        .some((value) => value?.toLowerCase().includes(needle)),
    );
  }, [consultations, search]);

  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;
  const date = (value: string) => formatDate(value, undefined, locale);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{label("Consultations", "الاستشارات")}</h1>
          <p className="mt-1 text-sm text-slate-500">{label("Dossiers cliniques structurés et chronologie des soins.", "الملفات السريرية وتسلسل الرعاية.")}</p>
        </div>
        <Link href="/patients" className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-white transition hover:opacity-90">
          <Icon name="plus" size={15} /> {label("Choisir un patient", "اختيار مريض")}
        </Link>
      </header>

      {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</p>}

      <section className="rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-900">
        <p className="font-semibold">{label("Comment enregistrer un audio ?", "كيف تسجل مقطعاً صوتياً؟")}</p>
        <ol className="mt-2 grid gap-x-6 gap-y-1 text-xs leading-5 text-blue-800 md:grid-cols-3">
          <li>{label("1. Ouvrez le dossier d’un patient et créez une consultation clinique enregistrée.", "١. افتح ملف المريض وأنشئ استشارة سريرية واحفظها.")}</li>
          <li>{label("2. Revenez ici, repérez cette consultation et confirmez le consentement du patient.", "٢. عد إلى هنا، وابحث عن الاستشارة ثم أكد موافقة المريض.")}</li>
          <li>{label("3. Démarrez, autorisez le microphone, parlez, puis arrêtez et enregistrez l’aperçu.", "٣. ابدأ التسجيل واسمح باستخدام الميكروفون، ثم أوقف التسجيل واحفظ المعاينة.")}</li>
        </ol>
        <p className="mt-2 text-[11px] text-blue-700">{label("Important : un rendez-vous de l’agenda seul ne suffit pas. Le microphone nécessite généralement localhost ou une connexion HTTPS.", "مهم: لا يكفي تسجيل موعد فقط في الأجندة. يتطلب الميكروفون عادة localhost أو اتصال HTTPS.")}</p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon="clipboard" label={label("Consultations enregistrées", "الاستشارات المسجلة")} value={summary.total} />
        <Metric icon="patients" label={label("Patients suivis", "المرضى المتابعون")} value={summary.patients} />
        <Metric icon="calendar" label={label("À venir", "القادمة")} value={summary.upcoming} />
        <Metric icon="checkCircle" label={label("Historique réalisé", "الاستشارات المنجزة")} value={summary.completed} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]">
        <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
            <div>
              <h2 className="font-bold text-ink">{label("Chronologie médicale", "التسلسل الطبي")}</h2>
              <p className="mt-1 text-xs text-slate-400">{label(`${filtered.length} consultation(s) enregistrée(s)`, `${filtered.length} استشارة مسجلة`)}</p>
            </div>
            <label className="relative block">
              <Icon name="search" size={15} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="search-with-icon w-56 rounded-xl border border-line py-2 ps-11 pe-3 text-xs outline-none transition focus:border-accent" placeholder={label("Patient, dossier, téléphone…", "المريض أو الملف أو الهاتف…")} />
            </label>
          </div>
          <div className="p-5">
            {loading ? <p className="py-10 text-center text-sm text-slate-400">{t("common.loading")}</p> :
              filtered.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">{label("Aucune consultation trouvée.", "لم يتم العثور على استشارة.")}</p> :
              <div className="relative space-y-5 before:absolute before:bottom-4 before:left-[9px] before:top-4 before:w-px before:bg-violet-100">
                {filtered.map((item) => <ConsultationCard key={`${item.source}-${item.id}`} item={item} locale={locale} date={date} label={label} patientHref={`/patients/${item.patientId}`} onRecordingUploaded={(recording) => {
                  setConsultations((current) => current.map((consultation) =>
                    consultation.source === "clinical" && consultation.id === item.id
                      ? { ...consultation, recordings: [recording, ...consultation.recordings] }
                      : consultation,
                  ));
                }} />)}
              </div>}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <h2 className="font-bold text-ink">{label("Commencer un enregistrement", "بدء تسجيل")}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">{label("L’audio s’ajoute à une consultation clinique déjà enregistrée dans le dossier du patient. Il ne peut pas être ajouté à un simple rendez-vous.", "يُضاف الصوت إلى استشارة سريرية محفوظة مسبقاً في ملف المريض، ولا يمكن إضافته إلى موعد عادي فقط.")}</p>
            <Link href="/patients" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-white transition hover:opacity-90"><Icon name="patients" size={14} /> {label("1. Ouvrir la liste des patients", "١. فتح قائمة المرضى")}</Link>
          </section>
          <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <h2 className="font-bold text-ink">{label("Pièces du dossier", "وثائق الملف")}</h2>
            <p className="mt-1 text-xs text-slate-400">{label("Bibliothèque documentaire patient", "مكتبة وثائق المرضى")}</p>
            {[
              [label("Radiographies", "صور الأشعة"), "—"],
              [label("Photos cliniques", "الصور السريرية"), "—"],
              [label("Odontogrammes", "مخططات الأسنان"), "—"],
              [label("Documents PDF", "مستندات PDF"), "—"],
            ].map(([name, count]) => <div key={name} className="flex justify-between border-b border-line py-3 text-xs"><span className="text-slate-500">{name}</span><strong className="text-ink">{count}</strong></div>)}
            <p className="mt-4 rounded-lg border border-dashed border-line px-3 py-3 text-center text-xs text-slate-400">{label("Les pièces sont accessibles depuis le dossier patient.", "الوثائق متاحة من ملف المريض.")}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ConsultationCard({ item, locale, date, label, patientHref, onRecordingUploaded }: { item: Consultation; locale: "fr" | "ar"; date: (value: string) => string; label: (fr: string, ar: string) => string; patientHref: string; onRecordingUploaded: (recording: Recording) => void }) {
  const [statusFr, statusAr] = statusLabels[item.status] ?? ["Consultation", "استشارة"];
  const initials = item.patientName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return <article className="relative pl-8">
    <span className="absolute left-0 top-1.5 z-10 h-[19px] w-[19px] rounded-full border-4 border-white bg-accent shadow-sm" />
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 transition hover:border-accent/30 hover:bg-white hover:shadow-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-violet-100 font-bold text-violet-600">{initials}</span>
        <strong className="text-ink">{item.patientName}</strong>
        <span className="text-[10px] text-slate-400">{date(item.consultationDate)} · {item.consultationNumber}</span>
        <span className="ml-auto rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">{locale === "ar" ? statusAr : statusFr}</span>
      </div>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <p><strong className="text-ink">{label("Motif", "السبب")} :</strong> <span className="text-slate-600">{item.consultationType}</span></p>
        <p><strong className="text-ink">{label("Praticien", "الممارس")} :</strong> <span className="text-slate-600">{item.practitioner}</span></p>
        {item.source === "clinical" ? <>
          {item.diagnosis && <p className="sm:col-span-2"><strong className="text-ink">{label("Diagnostic", "التشخيص")} :</strong> <span className="text-slate-600">{item.diagnosis}</span></p>}
          {item.anamnesis && <p className="sm:col-span-2"><strong className="text-ink">{label("Anamnèse", "السوابق المرضية")} :</strong> <span className="text-slate-600">{item.anamnesis}</span></p>}
          {item.treatment && <p className="sm:col-span-2"><strong className="text-ink">{label("Traitement", "العلاج")} :</strong> <span className="text-slate-600">{item.treatment}</span></p>}
          {item.recommendations && <p className="sm:col-span-2"><strong className="text-ink">{label("Recommandations", "التوصيات")} :</strong> <span className="text-slate-600">{item.recommendations}</span></p>}
          {item.nextAppointmentDate && <p className="sm:col-span-2"><strong className="text-ink">{label("Prochain rendez-vous", "الموعد القادم")} :</strong> <span className="text-slate-600">{date(item.nextAppointmentDate)}</span></p>}
        </> : <p className="sm:col-span-2"><strong className="text-ink">{label("Observations", "الملاحظات")} :</strong> <span className="text-slate-500">{item.notes || label("À compléter par le praticien", "يستكملها الممارس")}</span></p>}
      </div>
      <div className="mt-3 flex gap-4 text-xs font-semibold text-accent">
        <Link href={patientHref} className="inline-flex items-center gap-1 hover:underline"><Icon name="eye" size={13} /> {label("Ouvrir la fiche", "فتح الملف")}</Link>
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1 hover:underline"><Icon name="print" size={13} /> {label("Imprimer", "طباعة")}</button>
      </div>
      {item.source === "clinical" && <RecordingControls item={item} locale={locale} label={label} onUploaded={onRecordingUploaded} />}
    </div>
  </article>;
}

function RecordingControls({ item, locale, label, onUploaded }: { item: Consultation; locale: "fr" | "ar"; label: (fr: string, ar: string) => string; onUploaded: (recording: Recording) => void }) {
  const [consent, setConsent] = useState(false);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const discardRef = useRef(false);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      setElapsedMs(elapsed);
      if (elapsed >= 30 * 60 * 1000 && recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  function clearPreview() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl("");
    setAudio(null);
    setDurationMs(0);
    setElapsedMs(0);
  }

  async function startRecording() {
    setError("");
    clearPreview();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError(label("L’enregistrement audio n’est pas pris en charge par ce navigateur.", "التسجيل الصوتي غير مدعوم في هذا المتصفح."));
      return;
    }
    if (!consent) {
      setError(label("Confirmez d’abord le consentement explicite du patient.", "يرجى تأكيد موافقة المريض الصريحة أولاً."));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const preferredType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = preferredType ? new MediaRecorder(stream, { mimeType: preferredType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      discardRef.current = false;
      startTimeRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setRecording(false);
        if (discardRef.current) {
          discardRef.current = false;
          return;
        }
        const elapsed = Date.now() - startTimeRef.current;
        const mimeType = recorder.mimeType || preferredType || "";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const normalizedType = mimeType.split(";")[0];
        if (elapsed < 1000 || !["audio/webm", "audio/mp4"].includes(normalizedType)) {
          setError(label("Enregistrement trop court ou format non pris en charge.", "التسجيل قصير جداً أو أن التنسيق غير مدعوم."));
          return;
        }
        setAudio(blob);
        setDurationMs(elapsed);
        setAudioUrl(URL.createObjectURL(blob));
      };
      recorder.start(1000);
      setElapsedMs(0);
      setRecording(true);
    } catch (reason) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setError(reason instanceof Error && reason.name === "NotAllowedError"
        ? label("Accès au microphone refusé. Autorisez le microphone puis réessayez.", "تم رفض الوصول إلى الميكروفون. اسمح بالوصول ثم أعد المحاولة.")
        : label("Impossible de démarrer le microphone.", "تعذر تشغيل الميكروفون."));
    }
  }

  function stopRecording(discard = false) {
    discardRef.current = discard;
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
  }

  async function saveRecording() {
    if (!audio) return;
    setUploading(true);
    setError("");
    try {
      const mimeType = audio.type.split(";")[0];
      const formData = new FormData();
      formData.set("file", new File([audio], "consultation-audio", { type: mimeType }));
      formData.set("durationMs", String(Math.round(durationMs)));
      formData.set("consent", "true");
      const response = await fetch(`/api/consultations/${item.id}/recordings`, { method: "POST", body: formData });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? label("Enregistrement impossible.", "تعذر حفظ التسجيل."));
      onUploaded(body.data as Recording);
      clearPreview();
      setConsent(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : label("Enregistrement impossible.", "تعذر حفظ التسجيل."));
    } finally {
      setUploading(false);
    }
  }

  const minutes = Math.floor(elapsedMs / 60000).toString().padStart(2, "0");
  const seconds = Math.floor((elapsedMs % 60000) / 1000).toString().padStart(2, "0");

  return <section className="mt-4 space-y-3 rounded-lg border border-violet-100 bg-white p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <strong className="text-xs text-ink">{label("Audio de cette consultation", "الصوت الخاص بهذه الاستشارة")}</strong>
      <span className="text-[10px] text-slate-400">{label("Audio uniquement · maximum 30 min", "صوت فقط · 30 دقيقة كحد أقصى")}</span>
    </div>
    <p className="rounded-md bg-violet-50 px-3 py-2 text-[11px] leading-5 text-violet-800">
      {label("Pour enregistrer : confirmez le consentement ci-dessous, démarrez et autorisez le microphone. Quand vous avez terminé, arrêtez, écoutez l’aperçu, puis cliquez sur « Enregistrer l’audio » pour le conserver.", "للتسجيل: أكد الموافقة أدناه، ثم ابدأ واسمح باستخدام الميكروفون. عند الانتهاء أوقف التسجيل واستمع للمعاينة، ثم اضغط «حفظ التسجيل» للاحتفاظ به.")}
    </p>
    {item.recordings.map((recording) => (
      <div key={recording.id} className="space-y-1 rounded-md bg-slate-50 p-2">
        <audio className="w-full" controls preload="none" src={`/api/consultations/${item.id}/recordings/${recording.id}`} />
        <p className="text-[10px] text-slate-400">
          {label("Durée", "المدة")}: {Math.floor(recording.durationMs / 60000)}:{Math.floor((recording.durationMs % 60000) / 1000).toString().padStart(2, "0")}
          {" · "}{new Date(recording.createdAt).toLocaleString(locale === "ar" ? "ar-TN" : "fr-FR")}
        </p>
      </div>
    ))}
    <label className="flex items-start gap-2 text-[11px] leading-5 text-slate-600">
      <input type="checkbox" checked={consent} disabled={recording || uploading} onChange={(event) => setConsent(event.target.checked)} className="mt-1 accent-violet-600" />
      <span>{label("Je confirme avoir informé le patient et obtenu son consentement explicite à l’enregistrement audio de cette consultation.", "أؤكد أنني أبلغت المريض وحصلت على موافقته الصريحة لتسجيل صوت هذه الاستشارة.")}</span>
    </label>
    <div className="flex flex-wrap items-center gap-2">
      {!recording ? <button type="button" disabled={!consent || uploading} onClick={startRecording} className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
        {label("Démarrer l’enregistrement", "بدء التسجيل")}
      </button> : <>
        <button type="button" onClick={() => stopRecording()} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white">{label("Arrêter", "إيقاف")} · {minutes}:{seconds}</button>
        <button type="button" onClick={() => stopRecording(true)} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-slate-600">{label("Annuler", "إلغاء")}</button>
      </>}
      {audio && <>
        <button type="button" disabled={uploading} onClick={saveRecording} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
          {uploading ? label("Envoi…", "جارٍ الإرسال…") : label("Enregistrer l’audio", "حفظ التسجيل")}
        </button>
        <button type="button" disabled={uploading} onClick={clearPreview} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-slate-600">{label("Supprimer", "حذف")}</button>
      </>}
    </div>
    {audioUrl && <audio className="w-full" controls src={audioUrl} />}
    {recording && <p role="status" className="text-xs font-medium text-rose-700">{label("Enregistrement en cours. Cliquez sur « Arrêter » quand vous avez terminé.", "التسجيل جارٍ. اضغط «إيقاف» عند الانتهاء.")}</p>}
    {audio && <p role="status" className="text-xs font-medium text-amber-700">{label("Aperçu prêt : il n’est pas encore sauvegardé. Cliquez sur « Enregistrer l’audio » pour le conserver.", "المعاينة جاهزة ولم تُحفظ بعد. اضغط «حفظ التسجيل» للاحتفاظ بها.")}</p>}
    {!recording && !audio && item.recordings.length > 0 && <p className="text-xs text-emerald-700">{label("L’audio enregistré est conservé ci-dessus. Vous pouvez en ajouter un autre.", "التسجيل محفوظ أعلاه. يمكنك إضافة تسجيل آخر.")}</p>}
    {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
  </section>;
}

function Metric({ icon, label, value }: { icon: string; label: string; value: number }) {
  return <div className="rounded-2xl border border-line bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><div className="flex items-start justify-between"><span className="text-xs text-slate-500">{label}</span><span className="rounded-lg bg-violet-50 p-2 text-violet-600"><Icon name={icon} size={16} /></span></div><p className="mt-4 text-2xl font-bold text-ink">{value}</p></div>;
}
