import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { callCertificate, getPortalEmail } from '../lib/portal';
import PortalShell, { GREEN } from '../components/PortalShell';

// /certificate/:token — opened from the portal and from the email link.
// Works without logging in; the token in the URL is the key.
export default function CertificatePage() {
  const { token } = useParams();
  const [cert, setCert] = useState(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    callCertificate({ action: 'get', token })
      .then(setCert)
      .catch((err) => setError(err.message));
  }, [token]);

  // Signed links expire after 30 minutes, so fetch a fresh one on each click.
  async function download() {
    setDownloading(true);
    try {
      const fresh = await callCertificate({ action: 'get', token });
      window.location.href = fresh.download_url;
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  }

  const loggedIn = !!getPortalEmail();

  return (
    <PortalShell title="Your Certificate" backTo={loggedIn ? '/portal' : undefined}>
      {!cert && !error && (
        <div className="bg-white rounded-xl shadow-sm p-6 mt-4 text-sm text-gray-500">Loading your certificate…</div>
      )}

      {error && !cert && (
        <div className="bg-white rounded-xl shadow-sm p-6 mt-4">
          <p className="font-semibold text-gray-800">We couldn't open this certificate.</p>
          <p className="text-sm text-gray-600 mt-1">{error}</p>
        </div>
      )}

      {cert && (
        <>
          <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8 mt-4 text-center">
            <div
              className="w-14 h-14 rounded-full mx-auto flex items-center justify-center text-white text-2xl"
              style={{ backgroundColor: GREEN }}
            >
              ✓
            </div>
            <h2 className="text-xl font-bold text-gray-800 mt-4">Congratulations!</h2>
            <p className="text-gray-600 text-sm mt-1">Your Certificate of Attendance and Completion is ready.</p>
            <p className="mt-4 text-lg font-bold tracking-wide text-gray-900">{cert.full_name}</p>
            <p className="text-xs text-gray-500 mt-1">Certificate No. {cert.certificate_no}</p>

            <button
              onClick={download}
              disabled={downloading}
              className="mt-6 w-full sm:w-auto rounded-lg px-8 py-3 font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: GREEN }}
            >
              {downloading ? 'Preparing download…' : 'Download PDF'}
            </button>

            {cert.emailed && (
              <p className="text-xs text-gray-500 mt-4">
                A copy was also sent to your email, with a link back to this page.
              </p>
            )}
            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
          </div>

          {/* Preview (desktop only — phones handle embedded PDFs poorly) */}
          <div className="hidden sm:block bg-white rounded-xl shadow-sm p-3 mt-4">
            <iframe
              title="Certificate preview"
              src={`${cert.preview_url}#toolbar=0&view=FitH`}
              className="w-full rounded-lg"
              style={{ aspectRatio: '1.414 / 1' }}
            />
          </div>
        </>
      )}
    </PortalShell>
  );
}
