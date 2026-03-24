import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';

export default function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState({ username: '', email: '' });
  const [isDark, setIsDark] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [passwordData, setPasswordData] = useState({ current_password: '', new_password: '', confirm_password: '' });

  useEffect(() => {
    const userData = localStorage.getItem('user');
    const savedTheme = localStorage.getItem('chat-theme');
    if (userData) {
      setUser(JSON.parse(userData));
    }
    if (savedTheme === 'dark') {
      setIsDark(true);
    }

    const fetchProfile = async () => {
      try {
        const response = await authAPI.getProfile();
        if (response.data) {
          setUser(prev => ({ ...prev, ...response.data }));
          localStorage.setItem('user', JSON.stringify({ ...JSON.parse(userData || '{}'), ...response.data }));
        }
      } catch (error) {
        console.warn('Could not fetch fresh profile. It may not be implemented on backend.');
      }
    };
    fetchProfile();
  }, []);

  useEffect(() => {
    localStorage.setItem('chat-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const response = await authAPI.updateProfile({ username: user.username, email: user.email });
      if (response.data) {
        setUser(prev => ({ ...prev, ...response.data }));
        localStorage.setItem('user', JSON.stringify({ ...user, ...response.data }));
        setSuccessMsg('प्रोफाइल सफलतापूर्वक अपडेट भयो।');
      }
    } catch (error) {
      console.error(error);
      setErrorMsg(error.response?.data?.error || 'प्रोफाइल अपडेट गर्न असफल भयो। कृपया फेरि प्रयास गर्नुहोस्।');
    } finally {
      setLoading(false);
      setTimeout(() => setSuccessMsg(''), 5000);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordData.new_password !== passwordData.confirm_password) {
      setErrorMsg("नयाँ पासवर्डहरू मिलेनन्।");
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await authAPI.changePassword({ 
        old_password: passwordData.current_password, 
        new_password: passwordData.new_password 
      });
      setSuccessMsg('पासवर्ड सफलतापूर्वक परिवर्तन भयो।');
      setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
    } catch (error) {
      setErrorMsg(error.response?.data?.error || 'पासवर्ड परिवर्तन गर्न असफल भयो।');
    } finally {
      setLoading(false);
      setTimeout(() => setSuccessMsg(''), 5000);
    }
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

  return (
    <div className={`flex min-h-screen ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'}`}>
      <div className={`w-full max-w-3xl mx-auto my-8 flex flex-col rounded-3xl overflow-hidden shadow-2xl ${isDark ? 'bg-slate-900 shadow-black/50' : 'bg-white shadow-primary-900/10'}`}>
        
        {/* Header */}
        <div className={`px-6 py-6 border-b flex items-center justify-between ${isDark ? 'border-slate-800 bg-slate-800/50' : 'border-slate-200 bg-slate-50'}`}>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/chat')}
              className={`p-2 rounded-xl transition ${isDark ? 'hover:bg-slate-700 text-slate-400 hover:text-white' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-900'}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
            <div>
              <h1 className="text-xl font-bold tracking-tight">प्रोफाइल (Profile)</h1>
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>तपाईंको खाताको विवरण व्यवस्थापन गर्नुहोस्।</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            Logout
          </button>
        </div>

        {/* Content */}
        <div className="p-6 md:p-8 space-y-10">
          
          {/* Feedback messages */}
          {successMsg && (
            <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 font-medium text-sm flex items-center gap-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              {successMsg}
            </div>
          )}
          
          {errorMsg && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 font-medium text-sm flex items-center gap-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              {errorMsg}
            </div>
          )}

          {/* Profile Section */}
          <section>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              व्यक्तिगत विवरण (Personal Information)
            </h2>
            <div className={`p-6 rounded-2xl border ${isDark ? 'bg-slate-800/30 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>युजरनेम (Username)</label>
                    <input 
                      type="text" 
                      value={user.username || ''} 
                      onChange={(e) => setUser({...user, username: e.target.value})}
                      className={`w-full px-4 py-2.5 rounded-xl border text-sm transition focus:ring-2 focus:ring-primary-500 outline-none ${isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>इमेल (Email)</label>
                    <input 
                      type="email" 
                      value={user.email || ''} 
                      onChange={(e) => setUser({...user, email: e.target.value})}
                      className={`w-full px-4 py-2.5 rounded-xl border text-sm transition focus:ring-2 focus:ring-primary-500 outline-none ${isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                      required
                    />
                  </div>
                </div>
                <div className="pt-2 flex justify-end">
                  <button type="submit" disabled={loading} className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-xl transition disabled:opacity-50">
                    अपडेट गर्नुहोस् (Update Profile)
                  </button>
                </div>
              </form>
            </div>
          </section>

          {/* Password Section */}
          <section>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              पासवर्ड परिवर्तन (Change Password)
            </h2>
            <div className={`p-6 rounded-2xl border ${isDark ? 'bg-slate-800/30 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-1.5">
                  <label className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>हालको पासवर्ड (Current Password)</label>
                  <input 
                    type="password" 
                    value={passwordData.current_password} 
                    onChange={(e) => setPasswordData({...passwordData, current_password: e.target.value})}
                    className={`w-full px-4 py-2.5 rounded-xl border text-sm transition focus:ring-2 focus:ring-primary-500 outline-none ${isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                    required
                  />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>नयाँ पासवर्ड (New Password)</label>
                    <input 
                      type="password" 
                      value={passwordData.new_password} 
                      onChange={(e) => setPasswordData({...passwordData, new_password: e.target.value})}
                      className={`w-full px-4 py-2.5 rounded-xl border text-sm transition focus:ring-2 focus:ring-primary-500 outline-none ${isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>पासवर्ड पुष्टि गर्नुहोस् (Confirm Password)</label>
                    <input 
                      type="password" 
                      value={passwordData.confirm_password} 
                      onChange={(e) => setPasswordData({...passwordData, confirm_password: e.target.value})}
                      className={`w-full px-4 py-2.5 rounded-xl border text-sm transition focus:ring-2 focus:ring-primary-500 outline-none ${isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                      required
                    />
                  </div>
                </div>
                <div className="pt-2 flex justify-end">
                  <button type="submit" disabled={loading} className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white dark:bg-slate-700 dark:hover:bg-slate-600 text-sm font-semibold rounded-xl transition disabled:opacity-50">
                    परिवर्तन गर्नुहोस् (Change Password)
                  </button>
                </div>
              </form>
            </div>
          </section>

          {/* Preferences Section */}
          <section>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              प्राथमिकताहरू (Preferences)
            </h2>
            <div className={`p-6 rounded-2xl border ${isDark ? 'bg-slate-800/30 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">प्रिमियम डार्क मोड (Dark Mode)</h3>
                  <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>तपाईंको आँखाको सुरक्षाको लागि। (For your eye protection)</p>
                </div>
                <button
                  onClick={() => setIsDark((prev) => !prev)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isDark ? 'bg-primary-500' : 'bg-slate-300'}`}
                >
                  <span className={`${isDark ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
                </button>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
