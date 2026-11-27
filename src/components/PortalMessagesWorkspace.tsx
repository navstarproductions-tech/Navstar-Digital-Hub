import { useEffect, useMemo, useState } from 'react';
import { Mail, MessageCircle, Plus, RefreshCw, Send, UserRound, LoaderCircle } from 'lucide-react';

type Contact = { id: string; name: string; role: string };
type PortalMessage = {
  id: string; threadId: string; senderId: string; recipientId: string;
  subject: string; body: string; readAt?: string | null; createdAt: string;
  senderName: string; senderRole: string; recipientName: string; recipientRole: string;
};
type Thread = { id: string; messages: PortalMessage[]; latest: PortalMessage; unread: number };

const timeLabel = (value: string) => value ? new Date(value).toLocaleString('en-KE', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Nairobi'
}) : '';

export function PortalMessagesWorkspace({ userId, userName }: { userId: string; userName: string }) {
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [compose, setCompose] = useState(false);
  const [recipientId, setRecipientId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/messages', { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Messages could not be loaded.');
      const rows = Array.isArray(data.messages) ? data.messages as PortalMessage[] : [];
      setMessages(rows);
      setContacts(Array.isArray(data.contacts) ? data.contacts as Contact[] : []);
      setSelectedId(current => current || rows[0]?.threadId || '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Messages could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const threads = useMemo<Thread[]>(() => {
    const grouped = new Map<string, PortalMessage[]>();
    for (const message of messages) {
      const group = grouped.get(message.threadId) || [];
      group.push(message);
      grouped.set(message.threadId, group);
    }
    return Array.from(grouped.entries()).map(([id, items]) => {
      const ordered = [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return {
        id,
        messages: ordered,
        latest: ordered[ordered.length - 1],
        unread: ordered.filter(item => item.recipientId === userId && !item.readAt).length
      };
    }).sort((a, b) => b.latest.createdAt.localeCompare(a.latest.createdAt));
  }, [messages, userId]);

  const selected = threads.find(thread => thread.id === selectedId);
  const selectedRecipient = selected
    ? (selected.latest.senderId === userId ? selected.latest.recipientName : selected.latest.senderName)
    : '';

  useEffect(() => {
    if (!selectedId || compose) return;
    fetch('/api/messages', {
      method: 'PATCH', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: selectedId })
    }).then(response => {
      if (response.ok) setMessages(current => current.map(message =>
        message.threadId === selectedId && message.recipientId === userId && !message.readAt
          ? { ...message, readAt: new Date().toISOString() } : message
      ));
    }).catch(() => undefined);
  }, [selectedId, compose, userId]);

  const startNew = () => {
    setSelectedId('');
    setRecipientId('');
    setSubject('');
    setBody('');
    setCompose(true);
    setNotice('');
    setError('');
  };

  const send = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!recipientId || body.trim().length < 2 || sending) return;
    setSending(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/messages', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId,
          subject: compose ? subject : '',
          body,
          threadId: compose ? undefined : selectedId
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Your message could not be sent.');
      setBody('');
      setSubject('');
      setCompose(false);
      setSelectedId(data.threadId || selectedId);
      setNotice('Your message has been sent.');
      await load();
      if (data.threadId) setSelectedId(data.threadId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your message could not be sent.');
    } finally {
      setSending(false);
    }
  };

  const replyTo = selected
    ? (selected.latest.senderId === userId ? selected.latest.recipientId : selected.latest.senderId)
    : '';

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-3xl bg-gradient-to-r from-[#071a35] via-blue-950 to-[#16477e] p-5 text-white shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">NAVSTAR · STUDENT COMMUNICATION</p>
            <h3 className="mt-2 text-2xl font-black">Messages</h3>
            <p className="mt-1 max-w-xl text-sm leading-6 text-blue-100">Communicate privately with your tutors and Navstar administration.</p>
          </div>
          <button type="button" onClick={startNew} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-blue-950 shadow-sm hover:bg-cyan-50">
            <Plus className="h-4 w-4" /> New message
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-blue-100">
          <span>{threads.length} conversations</span>
          <span>·</span>
          <span>{threads.reduce((total, thread) => total + thread.unread, 0)} unread messages</span>
          <span>·</span>
          <span>Signed in as {userName}</span>
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-900">{notice}</p>}

      <div className="grid min-h-[560px] gap-4 lg:grid-cols-[minmax(250px,.8fr)_minmax(0,1.6fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div><h4 className="font-black text-slate-900">Your inbox</h4><p className="text-xs text-slate-500">Private conversations</p></div>
            <button type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh inbox" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={'h-4 w-4 '+(loading?'animate-spin':'')} /></button>
          </div>
          <div className="max-h-[620px] space-y-1 overflow-y-auto p-2">
            {threads.map(thread => {
              const other = thread.latest.senderId === userId ? thread.latest.recipientName : thread.latest.senderName;
              return <button key={thread.id} type="button" onClick={() => { setSelectedId(thread.id); setCompose(false); setNotice(''); }}
                className={'w-full rounded-xl border p-3 text-left transition '+(selectedId===thread.id&&!compose?'border-cyan-300 bg-cyan-50':'border-transparent hover:bg-slate-50')}>
                <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-bold text-slate-900">{other}</span>{thread.unread>0&&<span className="rounded-full bg-blue-900 px-2 py-0.5 text-[10px] font-black text-white">{thread.unread}</span>}</div>
                <p className="mt-1 truncate text-xs font-semibold text-slate-600">{thread.latest.subject || 'Portal conversation'}</p>
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">{thread.latest.body}</p>
                <p className="mt-2 text-[10px] text-slate-400">{timeLabel(thread.latest.createdAt)}</p>
              </button>;
            })}
            {!loading&&threads.length===0&&<div className="px-4 py-10 text-center"><Mail className="mx-auto h-8 w-8 text-slate-300"/><p className="mt-3 text-sm font-bold text-slate-700">Your inbox is empty</p><p className="mt-1 text-xs leading-5 text-slate-500">Start a conversation with your tutor or Navstar Administration.</p></div>}
          </div>
        </section>

        <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {compose ? <>
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-4"><h4 className="font-black text-slate-900">Compose a message</h4><p className="mt-1 text-xs text-slate-500">Your message will be delivered to the selected staff member.</p></div>
            <form onSubmit={send} className="flex flex-1 flex-col gap-4 p-5">
              <label className="text-xs font-bold text-slate-700">Send to
                <select required value={recipientId} onChange={event=>setRecipientId(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900">
                  <option value="">Choose a tutor or staff member</option>
                  {contacts.map(contact=><option key={contact.id} value={contact.id}>{contact.name} · {contact.role}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold text-slate-700">Subject
                <input required minLength={3} maxLength={160} value={subject} onChange={event=>setSubject(event.target.value)} placeholder="What would you like help with?" className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-normal text-slate-900"/>
              </label>
              <label className="flex flex-1 flex-col text-xs font-bold text-slate-700">Message
                <textarea required minLength={2} maxLength={5000} value={body} onChange={event=>setBody(event.target.value)} placeholder="Write your message here…" className="mt-1.5 min-h-[180px] flex-1 rounded-xl border border-slate-300 p-3 text-sm font-normal leading-6 text-slate-900"/>
              </label>
              <div className="flex flex-wrap justify-between gap-2"><button type="button" onClick={()=>setCompose(false)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700">Cancel</button><button type="submit" disabled={sending||!recipientId||body.trim().length<2} className="inline-flex items-center gap-2 rounded-xl bg-cyan-900 px-5 py-2.5 text-sm font-black text-white hover:bg-cyan-800 disabled:opacity-50">{sending?<LoaderCircle className="h-4 w-4 animate-spin"/>:<Send className="h-4 w-4"/>}{sending?'Sending…':'Send message'}</button></div>
            </form>
          </> : selected ? <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4">
              <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-cyan-100 text-cyan-900"><UserRound className="h-5 w-5"/></span><div><h4 className="font-black text-slate-900">{selectedRecipient}</h4><p className="text-xs text-slate-500">{selected.messages.length} messages in this conversation</p></div></div>
              <button type="button" onClick={startNew} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><Plus className="h-3.5 w-3.5"/>New</button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-[#f4f8fb] to-[#edf4f8] p-4 sm:p-5">
              {selected.messages.map(message=>{
                const mine=message.senderId===userId;
                return <div key={message.id} className={'flex '+(mine?'justify-end':'justify-start')}>
                  <article className={'max-w-[88%] rounded-2xl px-4 py-3 shadow-sm '+(mine?'rounded-br-md bg-gradient-to-br from-blue-900 to-cyan-900 text-white':'rounded-bl-md border border-slate-200 bg-white text-slate-800')}>
                    <p className={'mb-1 text-[10px] font-black uppercase tracking-wide '+(mine?'text-cyan-100':'text-cyan-800')}>{mine?'You':message.senderName}</p>
                    {message.subject&&<p className="mb-1 text-sm font-black">{message.subject}</p>}
                    <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p>
                    <p className={'mt-2 text-[10px] '+(mine?'text-blue-100':'text-slate-400')}>{timeLabel(message.createdAt)}</p>
                  </article>
                </div>;
              })}
            </div>
            <form onSubmit={send} className="border-t border-slate-100 bg-white p-4">
              <label className="sr-only" htmlFor="portal-message-reply">Write a reply</label>
              <textarea id="portal-message-reply" value={body} onChange={event=>setBody(event.target.value)} rows={3} maxLength={5000} placeholder="Write a reply…" className="w-full resize-y rounded-xl border border-slate-300 p-3 text-sm text-slate-900 outline-none focus:border-cyan-700 focus:ring-2 focus:ring-cyan-100"/>
              <div className="mt-2 flex justify-end"><button type="submit" disabled={sending||body.trim().length<2} className="inline-flex items-center gap-2 rounded-xl bg-cyan-900 px-4 py-2.5 text-sm font-black text-white hover:bg-cyan-800 disabled:opacity-50">{sending?<LoaderCircle className="h-4 w-4 animate-spin"/>:<Send className="h-4 w-4"/>}{sending?'Sending…':'Send reply'}</button></div>
            </form>
          </> : <div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><MessageCircle className="h-10 w-10 text-cyan-700"/><h4 className="mt-3 font-black text-slate-900">Your private message space</h4><p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">Select a conversation or start a new message to contact your tutor or Navstar Administration.</p><button type="button" onClick={startNew} className="mt-4 rounded-xl bg-cyan-900 px-4 py-2.5 text-sm font-bold text-white">Start a conversation</button></div>}
        </section>
      </div>
    </div>
  );
}
