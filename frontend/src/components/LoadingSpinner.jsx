import { Trophy, RefreshCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const LoadingSpinner = ({ fullScreen = false, message = null, transparent = false }) => {
    const { t } = useTranslation();
    const displayMessage = message || t('syncing');

    const content = (
        <div className="flex flex-col items-center justify-center p-8 bg-transparent">
            <div className="relative mb-6">
                <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full animate-pulse"></div>
                <div className="relative bg-white p-4 rounded-2xl shadow-xl shadow-indigo-100 flex items-center justify-center border border-indigo-50">
                    <Trophy className="text-indigo-600 animate-bounce" size={32} />
                </div>
                <div className="absolute -bottom-2 -right-2 bg-gray-950 p-1.5 rounded-full border-2 border-white shadow-lg">
                    <RefreshCcw size={14} className="text-white animate-spin" />
                </div>
            </div>
            <h3 className="text-lg font-black text-gray-950 tracking-tight uppercase animate-pulse">
                {displayMessage}
            </h3>
        </div>
    );

    if (fullScreen) {
        return (
            <div className={`fixed inset-0 z-[200] flex items-center justify-center ${transparent ? 'bg-white/80 backdrop-blur-sm' : 'bg-gray-50'}`}>
                {content}
            </div>
        );
    }

    return (
        <div className="w-full h-full flex items-center justify-center min-h-[50vh]">
            {content}
        </div>
    );
};

export default LoadingSpinner;
