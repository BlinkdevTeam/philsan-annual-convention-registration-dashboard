import { Link } from 'react-router-dom';

export const GREEN = '#1F773A';
export const GOLD = '#EDB221';

// Shared frame for the participant-facing pages (portal, quiz, survey,
// certificate, verify). No admin navigation.
export default function PortalShell({ title, intro, backTo, backLabel = 'Back to portal', children }) {
  return (
    <div className="min-h-screen bg-[#EAF3DE] py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {backTo && (
          <Link to={backTo} className="inline-block mb-3 text-sm font-medium text-[#1F773A] hover:underline">
            ← {backLabel}
          </Link>
        )}
        <div className="rounded-t-xl px-6 py-6 text-white" style={{ backgroundColor: GREEN }}>
          <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: GOLD }}>
            PHILSAN
          </p>
          <h1 className="text-xl sm:text-2xl font-bold mt-1">{title}</h1>
        </div>
        <div
          className={`bg-white rounded-b-xl shadow-sm border-t-4 ${intro ? 'px-6 py-5' : 'h-2'}`}
          style={{ borderColor: GOLD }}
        >
          {intro && <div className="text-gray-700 text-sm leading-relaxed">{intro}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}
