import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { conversationAPI, authAPI, messageAPI } from '../services/api';
import Sidebar from '../components/Sidebar';
import DocumentUpload from '../components/DocumentUpload';
import { transliterate } from '../utils/nepaliRomanized';

export default function Chat() {
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);

  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputRaw, setInputRaw] = useState('');
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editRawContent, setEditRawContent] = useState('');
  const [lastSources, setLastSources] = useState(null);
  const [isDark, setIsDark] = useState(false);
  const [romanizedTypingEnabled, setRomanizedTypingEnabled] = useState(true);

  const formatChatTimestamp = (isoString) => {
    if (!isoString) return '';
    const ts = new Date(isoString);
    const now = new Date();

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const timePart = ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    if (ts >= startOfToday) {
      return timePart;
    }

    if (ts >= startOfYesterday) {
      return `Yesterday, ${timePart}`;
    }

    const datePart = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${datePart} • ${timePart}`;
  };

  useEffect(() => {
    const userData = localStorage.getItem('user');
    const savedTheme = localStorage.getItem('chat-theme');
    const savedRomanizedTyping = localStorage.getItem('romanized-typing-enabled');
    if (userData) {
      setUser(JSON.parse(userData));
    }
    if (savedTheme === 'dark') {
      setIsDark(true);
    }
    if (savedRomanizedTyping === 'false') {
      setRomanizedTypingEnabled(false);
    }
    loadConversations();
  }, []);

  useEffect(() => {
    localStorage.setItem('chat-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    localStorage.setItem('romanized-typing-enabled', romanizedTypingEnabled ? 'true' : 'false');
  }, [romanizedTypingEnabled]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversations = async () => {
    try {
      const response = await conversationAPI.list();
      setConversations(response.data);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const loadConversation = async (id) => {
    try {
      const response = await conversationAPI.get(id);
      setActiveConversation(response.data);
      const msgs = response.data.messages || [];
      setMessages(msgs);
      // Pick latest assistant message with sources to display chips after reload
      const lastAssistantWithSources = [...msgs].reverse().find((m) => m.role === 'assistant' && m.sources);
      setLastSources(lastAssistantWithSources?.sources || null);
      setSidebarOpen(false);
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  };

  const startNewChat = async () => {
    try {
      const response = await conversationAPI.create({ title: 'नयाँ कुराकानी' });
      setConversations((prev) => [response.data, ...prev]);
      setActiveConversation(response.data);
      setMessages([]);
      setSidebarOpen(false);
      setLastSources(null);
      return response.data;
    } catch (error) {
      console.error('Failed to create conversation:', error);
      return null;
    }
  };

  const sendMessageToConversation = async (conversationId, content) => {
    setLoading(true);
    const tempUserMessage = {
      id: Date.now(),
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMessage]);
    setInputRaw('');

    try {
      const response = await conversationAPI.addMessage(conversationId, content);
      if (response.data.sources) {
        setLastSources(response.data.sources);
      }

      setMessages((prev) => {
        const withoutTemp = prev.filter((message) => message.id !== tempUserMessage.id);
        return [...withoutTemp, response.data.user_message, response.data.assistant_message];
      });

      loadConversations();
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages((prev) => prev.filter((message) => message.id !== tempUserMessage.id));
      alert('प्रश्न पठाउन असफल भयो। पुन: प्रयास गर्नुहोस्।');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();
    const toSend = romanizedTypingEnabled ? transliterate(inputRaw).trim() : inputRaw.trim();
    if (!toSend || loading) return;

    let targetConversation = activeConversation;
    if (!targetConversation) {
      targetConversation = await startNewChat();
      if (!targetConversation) return;
    }

    await sendMessageToConversation(targetConversation.id, toSend);
  };

  const handleLogout = async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      navigate('/login');
    }
  };

  const handleDocumentUploadComplete = () => {
    loadConversations();
  };

  const handleStartEdit = (message) => {
    setEditingMessageId(message.id);
    setEditRawContent(message.content);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditRawContent('');
  };

  const handleSaveEdit = async (messageId) => {
    const toSend = romanizedTypingEnabled ? transliterate(editRawContent).trim() : editRawContent.trim();
    if (!toSend) return;

    // Optimistically update user message text and remove following assistant reply while loading
    setMessages((prev) => {
      const updated = [...prev];
      const idx = updated.findIndex((m) => m.id === messageId);
      if (idx !== -1) {
        updated[idx] = { ...updated[idx], content: toSend };
        if (idx + 1 < updated.length && updated[idx + 1].role === 'assistant') {
          updated.splice(idx + 1, 1);
        }
      }
      return updated;
    });
    setLastSources(null);
    setLoading(true);
    try {
      const response = await messageAPI.update(messageId, toSend);
      setMessages((prev) => {
        const filtered = prev.filter((message) => message.id !== messageId);
        const userMsgIndex = prev.findIndex((message) => message.id === messageId);
        if (userMsgIndex !== -1 && userMsgIndex + 1 < prev.length) {
          const nextMsg = prev[userMsgIndex + 1];
          if (nextMsg.role === 'assistant') {
            return [
              ...filtered.filter((message) => message.id !== nextMsg.id),
              response.data.user_message,
              response.data.assistant_message,
            ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
          }
        }
        return [
          ...filtered,
          response.data.user_message,
          response.data.assistant_message,
        ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      });

      if (response.data.sources) {
        setLastSources(response.data.sources);
      }

      setEditingMessageId(null);
      setEditRawContent('');
    } catch (error) {
      console.error('Failed to edit message:', error);
      alert('सन्देश सम्पादन असफल भयो।');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyMessage = async (content) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleDeleteConversation = async (conversationId) => {
    try {
      await conversationAPI.delete(conversationId);
      setConversations((prev) => prev.filter((conversation) => conversation.id !== conversationId));
      if (activeConversation?.id === conversationId) {
        setActiveConversation(null);
        setMessages([]);
        setLastSources(null);
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      alert('कुराकानी मेटाउन असफल भयो।');
    }
  };

  const handleRawChange = (incoming, setRaw) => {
    if (!romanizedTypingEnabled) {
      setRaw(incoming.target.value);
      return;
    }

    const { inputType, data, clipboardData } = incoming.nativeEvent || {};
    const targetValue = incoming.target.value;

    setRaw((prev) => {
      // Basic append / delete-at-end handling keeps roman context.
      if (inputType?.startsWith('delete')) {
        return prev.slice(0, -1);
      }

      if (inputType === 'insertFromPaste') {
        const pasted = clipboardData?.getData('text') ?? incoming.clipboardData?.getData('text') ?? targetValue;
        return pasted;
      }

      if (typeof data === 'string') {
        return prev + data;
      }

      // Fallback: keep previous to avoid corrupting roman buffer when cursor edits occur.
      return prev;
    });
  };

  const renderSourceBadges = (sources) => {
    if (!sources?.files || !sources.files.length) return null;

    return (
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {sources.files.map((fileItem, idx) => {
          const isUser = fileItem.source === 'user_document';
          return (
            <span
              key={`${fileItem.source}-${fileItem.file}-${idx}`}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${isUser
                ? 'border-blue-200 bg-blue-50 text-blue-700'
                : 'border-primary-300 bg-primary-100 text-primary-800'}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4l2 4 4 .5-3 3 .8 4L12 13l-3.8 2.5.8-4-3-3 4-.5z" />
              </svg>
              <span className="truncate max-w-[140px]" title={`${fileItem.file} (${isUser ? 'User' : 'Permanent'})`}>
                {fileItem.file}
              </span>
              <span className="uppercase text-[9px] tracking-wide">{isUser ? 'USER' : 'PERM'}</span>
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`flex h-screen overflow-hidden ${isDark ? 'bg-slate-950' : 'bg-slate-100'}`}>
      <Sidebar
        conversations={conversations}
        activeConversation={activeConversation}
        user={user}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        onSelectConversation={loadConversation}
        onNewChat={startNewChat}
        onLogout={handleLogout}
        onDeleteConversation={handleDeleteConversation}
      />

      <div className={`flex-1 min-w-0 flex flex-col ${isDark ? 'bg-[radial-gradient(circle_at_top,_#1e293b,_#0f172a_45%,_#020617)]' : 'bg-[radial-gradient(circle_at_top,_#f8fafc,_#eef2ff_35%,_#e2e8f0)]'}`}>
        <div className={`border-b backdrop-blur px-4 py-3 md:px-6 flex items-center gap-3 ${isDark ? 'border-slate-700/60 bg-slate-900/70' : 'border-white/70 bg-white/80'}`}>
          <button onClick={() => setSidebarOpen(true)} className="md:hidden p-1.5 hover:bg-primary-100 rounded-lg transition text-primary-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="flex-1 min-w-0 flex items-center gap-3">
            <h1 className={`text-base md:text-lg font-bold tracking-tight truncate ${isDark ? 'text-slate-100' : 'text-primary-900'}`}>SevaBot</h1>
            <p className={`text-base md:text-sm  tracking-tight truncate ${isDark ? 'text-slate-100' : 'text-primary-900'}`}>RAG-Based Nepali Legal Assistant</p>
          </div>
          <button
            onClick={() => setIsDark((prev) => !prev)}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${isDark ? 'border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700' : 'border-primary-200 bg-white text-primary-700 hover:bg-primary-50'}`}
            title="Toggle theme"
          >
            <span>{isDark ? '☀️' : '🌙'}</span>
            <span>{isDark ? 'Light' : 'Dark'}</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="w-full max-w-3xl px-4 text-center">
                <div className="w-16 h-16 bg-primary-900 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-primary-900/20"><span className="text-3xl">&#x1F64F;</span></div>
                <h2 className="np-heading text-2xl mb-2 text-primary-900">नमस्कार!</h2>
                <p className="text-primary-600 text-sm mb-8">तपाईंको नेपाली कानुनी सहायक — Retrieval-Augmented Generation with SBERT Reranking</p>
                <div className="grid md:grid-cols-2 gap-4 text-left">
                  <div className="rounded-2xl border border-primary-200 bg-white/90 p-5 shadow-sm">
                    <h3 className="font-semibold text-sm text-primary-900 mb-3">कसरी प्रयोग गर्ने</h3>
                    <div className="space-y-3 text-sm">
                      <p><span className="font-semibold text-primary-800">1.</span> PDF दस्तावेज अपलोड गर्नुहोस्</p>
                      <p><span className="font-semibold text-primary-800">2.</span> SBERT embedding र indexing पर्खनुहोस्</p>
                      <p><span className="font-semibold text-primary-800">3.</span> नेपालीमा प्रश्न सोध्नुहोस्</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-primary-200 bg-gradient-to-br from-primary-900 to-primary-800 p-5 shadow-sm text-primary-100">
                    <h3 className="font-semibold text-sm mb-3">Pipeline</h3>
                    <div className="text-xs space-y-2 text-primary-200">
                      <p>• Query Encoding with `multilingual-e5-large`</p>
                      <p>• Dense Retrieval from ChromaDB</p>
                      <p>• Cross-Encoder SBERT Reranking</p>
                      <p>• Grounded Nepali Response Generation</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-5">
              {messages.map((message, index) => (
                <div key={message.id} className={`flex message-enter ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] md:max-w-[78%] rounded-2xl px-4 py-3 md:px-5 md:py-4 shadow-sm ${message.role === 'user' ? 'bg-primary-900 text-white shadow-primary-900/20' : isDark ? 'bg-slate-900/90 border border-slate-700 text-slate-100' : 'bg-white/95 border border-primary-200 text-primary-800'}`}>
                    {message.role === 'assistant' && (
                      <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-primary-100">
                        <div className="flex items-center gap-2"><div className="w-6 h-6 bg-primary-100 rounded-lg flex items-center justify-center"><span className="text-xs">⚖️</span></div><span className="font-semibold text-xs text-primary-700">SevaBot</span></div>
                        <button onClick={() => handleCopyMessage(message.content)} className="p-1.5 hover:bg-primary-100 rounded-lg transition" title="प्रतिलिपि गर्नुहोस्"><svg className="w-3.5 h-3.5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg></button>
                      </div>
                    )}

                    {editingMessageId === message.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={romanizedTypingEnabled ? transliterate(editRawContent) : editRawContent}
                          onChange={(e) => handleRawChange(e, setEditRawContent)}
                          className={`w-full px-1 py-1 rounded-lg text-sm transition border-0 outline-none focus:outline-none focus:ring-0 bg-transparent ${message.role === 'user' ? 'text-white placeholder:text-primary-300' : isDark ? 'text-slate-100 placeholder:text-slate-400' : 'text-primary-800 placeholder:text-primary-400'}`}
                          rows="3"
                          autoFocus
                          placeholder=""
                        />
                        <div className="flex gap-2 justify-end">
                          <button onClick={handleCancelEdit} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${message.role === 'user' ? 'bg-white/10 text-white hover:bg-white/20' : isDark ? 'bg-slate-700 text-slate-100 hover:bg-slate-600' : 'bg-primary-100 text-primary-700 hover:bg-primary-200'}`}>Cancel</button>
                          <button onClick={() => handleSaveEdit(message.id)} disabled={loading} className="px-3 py-1.5 text-xs font-medium bg-white text-primary-900 hover:bg-primary-100 rounded-lg transition disabled:opacity-50">OK</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="whitespace-pre-wrap leading-relaxed text-sm np-text">{message.content}</div>
                        {message.role === 'assistant' && renderSourceBadges(message.sources || (index === messages.length - 1 ? lastSources : null))}
                        <div className="flex items-center justify-between mt-3">
                          <div className={`text-[10px] ${message.role === 'user' ? 'text-primary-300' : 'text-primary-500'}`}>{formatChatTimestamp(message.created_at)}</div>
                          {message.role === 'user' && (
                            <button onClick={() => handleStartEdit(message)} className="p-1.5 hover:bg-white/10 rounded-lg transition" title="सम्पादन गर्नुहोस्"><svg className="w-3.5 h-3.5 text-primary-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start message-enter">
                  <div className="rounded-2xl border border-primary-200 bg-white px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-2"><div className="w-6 h-6 bg-primary-100 rounded-lg flex items-center justify-center"><span className="text-xs">⚖️</span></div><span className="text-xs text-primary-600">Retrieving & reranking...</span><div className="flex gap-1 ml-1"><div className="w-1.5 h-1.5 bg-primary-400 rounded-full typing-dot"></div><div className="w-1.5 h-1.5 bg-primary-400 rounded-full typing-dot"></div><div className="w-1.5 h-1.5 bg-primary-400 rounded-full typing-dot"></div></div></div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

          <div className={`border-t backdrop-blur px-4 py-3 md:px-6 ${isDark ? 'border-slate-700/60 bg-slate-900/70' : 'border-white/70 bg-white/80'}`}>
          <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setRomanizedTypingEnabled((prev) => !prev)}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                  romanizedTypingEnabled
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : isDark
                    ? 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                }`}
                title="Romanized Nepali typing: type 'namaste' → नमस्ते"
              >
                <span>{romanizedTypingEnabled ? '✓' : '○'}</span>
                <span>Romanized नेपाली typing</span>
              </button>
            </div>
            <div className={`relative rounded-2xl border shadow-sm ${isDark ? 'border-slate-600 bg-slate-900' : 'border-primary-300 bg-white'}`}>
              <textarea
                value={romanizedTypingEnabled ? transliterate(inputRaw) : inputRaw}
                onChange={(e) => handleRawChange(e, setInputRaw)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(e);
                  }
                }}
                placeholder="आफ्नो प्रश्न नेपालीमा सोध्नुहोस्..."
                className={`w-full pl-12 pr-12 py-3 rounded-2xl resize-none transition text-sm np-text border-0 outline-none focus:outline-none focus:ring-0 ${isDark ? 'bg-transparent text-slate-100 placeholder:text-slate-400' : 'bg-transparent text-primary-900 placeholder:text-primary-500'}`}
                rows="1"
                disabled={loading}
                style={{ minHeight: '52px', maxHeight: '120px' }}
              />

              <div className="absolute top-1/2 -translate-y-1/2 left-3">
                <DocumentUpload conversationId={activeConversation?.id} onUploadComplete={handleDocumentUploadComplete} />
              </div>

              <button type="submit" disabled={loading || !(romanizedTypingEnabled ? transliterate(inputRaw).trim() : inputRaw.trim())} className="absolute top-1/2 -translate-y-1/2 right-3 bg-primary-900 hover:bg-primary-800 text-white p-2 rounded-xl transition disabled:opacity-30 disabled:cursor-not-allowed" title="पठाउनुहोस्">
                {loading ? (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}