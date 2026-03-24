import { useState } from 'react';
import DocumentsPanel from './DocumentsPanel';
import { Link } from 'react-router-dom';

export default function Sidebar({
  conversations,
  activeConversation,
  user,
  sidebarOpen,
  setSidebarOpen,
  onSelectConversation,
  onNewChat,
  onLogout,
  onDeleteConversation,
}) {
  const [showDocuments, setShowDocuments] = useState(false);

  return (
    <>
      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-950/45 backdrop-blur-[1px] z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed md:static inset-y-0 left-0 z-50
          w-80 md:w-80 
          transform transition-transform duration-200 ease-out
          md:transform-none
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
          flex flex-col border-r border-primary-800/80 shadow-2xl shadow-primary-950/30
        `}
      >
        {/* Header */}
        <div className="p-4 border-b border-primary-800/80 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-lg shadow-black/30 overflow-hidden p-1">
                <img src="/logo.png" alt="SevaBot" className="w-full h-full object-contain" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-600 tracking-tight">Workspace</h2>
                <p className="text-[10px] text-gray-600 leading-tight">Chat + Documents</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden text-gray-100 hover:text-white transition p-1"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tab Switcher */}
          <div className="flex gap-1 p-1 bg-primary-800/80 rounded-xl mb-3">
            <button
              onClick={() => setShowDocuments(false)}
              className={`flex-1 py-1.5 px-2 rounded-md transition text-xs font-medium ${!showDocuments
                ? 'bg-primary-700 text-gray-100 shadow-sm'
                : 'text-primary-100 hover:text-primary-200'
                }`}
            >
              कुराकानी
            </button>
            <button
              onClick={() => setShowDocuments(true)}
              className={`flex-1 py-1.5 px-2 rounded-md transition text-xs font-medium ${showDocuments
                ? 'bg-primary-700 text-gray-100 shadow-sm'
                : 'text-primary-100 hover:text-primary-200'
                }`}
            >
              दस्तावेज
            </button>
          </div>

          {/* New Chat Button */}
          {!showDocuments && (
            <button
              onClick={onNewChat}
              className="w-full bg-primary-800 hover:bg-primary-700 text-primary-100 py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-2 text-sm font-medium border border-primary-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              नयाँ कुराकानी
            </button>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {showDocuments ? (
            <DocumentsPanel conversationId={activeConversation?.id} />
          ) : (
            <div className="p-2.5">
              {conversations.length === 0 ? (
                <div className="text-center text-primary-400 py-10 px-4 text-xs">
                  <p className="np-text">कुनै कुराकानी छैन।</p>
                  <p className="mt-1">नयाँ सुरु गर्नुहोस्!</p>
                </div>
              ) : (
                conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`group relative rounded-xl mb-1.5 transition ${activeConversation?.id === conv.id
                      ? 'bg-primary-800 ring-1 text-primary-100 ring-primary-800/80'
                      : 'hover:bg-primary-800/60 hover:text-primary-100 text-primary-600'
                      }`}
                  >
                    <button
                      onClick={() => onSelectConversation(conv.id)}
                      className="w-full text-left p-3.5"
                    >
                      <div className="font-medium truncate text-sm  pr-6">
                        {conv.recent_exchange?.query || conv.title}
                      </div>
                      <div className="text-xs text-primary-300 truncate mt-0.5">
                        {conv.last_message?.content || 'कुनै सन्देश छैन'}
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteConversation(conv.id);
                      }}
                      className="absolute top-2.5 right-2.5 p-1 opacity-0 group-hover:opacity-100 hover:bg-primary-700/40 rounded-lg transition"
                      title="मेटाउनुहोस्"
                    >
                      <svg className="w-3.5 h-3.5 text-primary-300 hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* User Section */}
        <div className="p-3 border-t border-primary-800/80 flex-shrink-0 bg-primary-950/20">
          <Link to="/profile" className="flex items-center gap-2.5 mb-2.5">
            <div className="w-8 h-8 bg-primary-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 text-primary-100">
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate text-sm text-primary-500">
                {user?.username || 'User'}
              </div>
              <div className="text-[10px] text-primary-500 truncate">
                {user?.email || ''}
              </div>
            </div>
          </Link>

          <button
            onClick={onLogout}
            className="w-full py-2.5 px-3 rounded-xl border border-primary-700 text-gray-600 font-semibold hover:text-white hover:border-primary-500 hover:bg-primary-800 transition text-xs  flex items-center justify-center gap-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            बाहिर निस्कनुहोस्
          </button>
        </div>
      </div>
    </>
  );
}