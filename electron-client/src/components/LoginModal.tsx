import React, { useState, useEffect, useCallback } from 'react';
import { X, Loader2, CheckCircle, AlertCircle, ExternalLink, Copy, User } from 'lucide-react';
import { useAccountStore } from '../stores/accountStore';
import axios from 'axios';

const API_URL = 'http://localhost:35555/api';

interface LoginModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

type LoginState = 'idle' | 'loading' | 'code' | 'polling' | 'success' | 'error';

export function LoginModal({ onClose, onSuccess }: LoginModalProps) {
  const [state, setState] = useState<LoginState>('idle');
  const [userCode, setUserCode] = useState('');
  const [verificationUri, setVerificationUri] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  
  const { addAccount, selectAccount } = useAccountStore();

  // Start device code flow
  const startLogin = async () => {
    setState('loading');
    setError('');
    
    try {
      const res = await axios.post(`${API_URL}/auth/device-code`);
      setUserCode(res.data.userCode);
      setVerificationUri(res.data.verificationUri);
      setState('code');
      
      // Start polling
      pollForToken();
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Failed to start login');
      setState('error');
    }
  };

  // Poll for token
  const pollForToken = useCallback(async () => {
    setState('polling');
    
    const poll = async () => {
      try {
        const res = await axios.get(`${API_URL}/auth/poll`);
        
        if (res.data.status === 'success') {
          // Login successful!
          const account = res.data.account;
          addAccount({
            uuid: account.uuid,
            name: account.username,
            email: '',
            accessToken: '', // Token is stored in backend
            expiresAt: new Date(Date.now() + 86400000),
            skinUrl: account.skinUrl,
          });
          selectAccount(account.uuid);
          setState('success');
          
          setTimeout(() => {
            onSuccess?.();
            onClose();
          }, 1500);
          return;
        } else if (res.data.status === 'pending') {
          // Keep polling
          setTimeout(poll, 3000);
        }
      } catch (e: any) {
        if (e.response?.data?.error?.includes('expired')) {
          setError('Login timed out. Please try again.');
          setState('error');
        } else {
          // Keep polling on transient errors
          setTimeout(poll, 3000);
        }
      }
    };
    
    poll();
  }, [addAccount, selectAccount, onClose, onSuccess]);

  const copyCode = () => {
    navigator.clipboard.writeText(userCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openMicrosoftLink = () => {
    // Try to open in browser
    if (window.require) {
      const { shell } = window.require('electron');
      shell.openExternal(verificationUri);
    } else {
      window.open(verificationUri, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <User size={22} className="text-cyan-400" />
            Microsoft Login
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Idle State */}
          {state === 'idle' && (
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
                <User size={40} className="text-white" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Sign in with Microsoft</h3>
              <p className="text-gray-400 text-sm mb-6">
                Connect your Microsoft account to play Minecraft with your profile, skins, and capes.
              </p>
              <button
                onClick={startLogin}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-cyan-500/30 transition-all"
              >
                Continue with Microsoft
              </button>
            </div>
          )}

          {/* Loading State */}
          {state === 'loading' && (
            <div className="text-center py-8">
              <Loader2 size={48} className="mx-auto text-cyan-400 animate-spin mb-4" />
              <p className="text-gray-400">Starting login flow...</p>
            </div>
          )}

          {/* Code Display State */}
          {(state === 'code' || state === 'polling') && (
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-4">
                Enter this code at Microsoft:
              </p>
              
              {/* Code Display */}
              <div 
                onClick={copyCode}
                className="relative group cursor-pointer mb-4"
              >
                <div className="text-4xl font-mono font-bold text-white tracking-widest py-4 px-6 bg-slate-800 rounded-xl border border-white/10 group-hover:border-cyan-500/50 transition-colors">
                  {userCode}
                </div>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {copied ? (
                    <CheckCircle size={20} className="text-green-400" />
                  ) : (
                    <Copy size={20} className="text-gray-400" />
                  )}
                </div>
              </div>

              <p className="text-xs text-gray-500 mb-4">
                Click code to copy
              </p>

              {/* Open Link Button */}
              <button
                onClick={openMicrosoftLink}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 mb-4"
              >
                <ExternalLink size={18} />
                Open microsoft.com/link
              </button>

              {/* Polling Indicator */}
              {state === 'polling' && (
                <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
                  <Loader2 size={16} className="animate-spin" />
                  Waiting for you to sign in...
                </div>
              )}

              <p className="text-xs text-gray-500 mt-4">
                After signing in, this window will close automatically.
              </p>
            </div>
          )}

          {/* Success State */}
          {state === 'success' && (
            <div className="text-center py-8">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle size={40} className="text-green-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Successfully logged in!</h3>
              <p className="text-gray-400 text-sm">Redirecting...</p>
            </div>
          )}

          {/* Error State */}
          {state === 'error' && (
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                <AlertCircle size={32} className="text-red-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Login Failed</h3>
              <p className="text-red-400 text-sm mb-6">{error}</p>
              <button
                onClick={startLogin}
                className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LoginModal;
