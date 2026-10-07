// src/pages/QuizMaintenance.jsx
// 39th Annual Convention: shown instead of the quiz while it is being updated.
// To turn maintenance OFF, set QUIZ_MAINTENANCE = false in src/App.jsx.
import { Link } from 'react-router-dom';

export default function QuizMaintenance() {
    return (
        <div className="min-h-screen bg-[#f1efe8] flex items-center justify-center px-4 py-10">
            <div className="w-full max-w-[460px] bg-white border border-[#e5e3da] rounded-lg p-8 text-center">
                <div className="text-[40px] mb-3" aria-hidden="true">🛠️</div>
                <h1 className="text-[20px] font-bold text-[#16572A] mb-2">
                    The quiz is currently under maintenance
                </h1>
                <p className="text-[14px] text-[#5f5e5a] leading-relaxed mb-6">
                    We are updating the quiz right now. Please check back in a little while.
                    Thank you for your patience.
                </p>
                <Link
                    to="/portal"
                    className="inline-block bg-[#16572A] hover:bg-[#EDB221] text-white px-6 py-2.5 rounded-tl-[20px] rounded-br-[20px] text-[14px] font-medium"
                >
                    Back to portal
                </Link>
            </div>
        </div>
    );
}