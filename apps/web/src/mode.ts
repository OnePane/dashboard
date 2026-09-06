export const isDemoMode = typeof window !== 'undefined' && (window.location.hostname.startsWith('demo.') || import.meta.env.VITE_DEMO_MODE === 'true')
