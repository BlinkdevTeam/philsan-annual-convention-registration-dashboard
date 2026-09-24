import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import PortalShell, { GREEN } from '../components/PortalShell';

// /verify/:code — where the QR code on every certificate points.
export default function VerifyPage() {
  const { code } = useParams();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.rpc('verify_certificate', { p_code: code }).then(({ data, error: rpcError }) => {
      if (rpcError) setError('Could not check this certificate right now. Please try again.');
      else setResult(data);
    });
  }, [code]);

  const issued = result?.issued_at
    ? new Date(result.issued_at).toLocaleDateString('en-PH', { dateStyle: 'long', timeZone: 'Asia/Manila' })
    : '';

  return (
    <PortalShell title="Certificate Verification">
      <div className="bg-white rounded-xl shadow-sm p-8 mt-4 text-center">
        {!result && !error && <p className="text-sm text-gray-500">Checking certificate…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {result?.valid && (
          <>
            <div
              className="w-14 h-14 rounded-full mx-auto flex items-center justify-center text-white text-2xl"
              style={{ backgroundColor: GREEN }}
            >
              ✓
            </div>
            <h2 className="text-xl font-bold text-[#1F773A] mt-4">Valid certificate</h2>
            <p className="text-sm text-gray-600 mt-3">This Certificate of Attendance and Completion was issued to</p>
            <p className="text-lg font-bold tracking-wide text-gray-900 mt-1">{result.full_name}</p>
            <p className="text-sm text-gray-600 mt-3">for the 39th PHILSAN Annual Convention.</p>
            <dl className="mt-5 inline-grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-left">
              <dt className="text-gray-500">Certificate No.</dt>
              <dd className="font-medium text-gray-800">{result.certificate_no}</dd>
              <dt className="text-gray-500">Issued</dt>
              <dd className="font-medium text-gray-800">{issued}</dd>
            </dl>
            <p className="text-xs text-gray-500 mt-6">
              Make sure the name and number above match the certificate you're checking.
            </p>
          </>
        )}

        {result && !result.valid && (
          <>
            <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center bg-red-100 text-red-600 text-2xl">
              ✕
            </div>
            <h2 className="text-xl font-bold text-gray-800 mt-4">Certificate not found</h2>
            <p className="text-sm text-gray-600 mt-2">
              No PHILSAN certificate exists with the number <span className="font-semibold">{code}</span>.
            </p>
          </>
        )}
      </div>
    </PortalShell>
  );
}
