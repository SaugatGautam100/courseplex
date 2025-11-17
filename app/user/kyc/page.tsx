"use client";

import { useEffect, useState, type FormEvent, type ChangeEvent } from "react";
import { database, auth } from "@/lib/firebase";
import { ref, onValue, update } from "firebase/database";
import type { InputHTMLAttributes } from "react";

// Define the types for KYC data
type KycStatus = "Not Submitted" | "Pending" | "Approved" | "Rejected";
type KycData = {
  status: KycStatus;
  fullName?: string;
  address?: string;
  citizenshipNo?: string;
  contactNo?: string;
  fatherName?: string;
  motherName?: string;
};

export default function KycPage() {
  const [kyc, setKyc] = useState<KycData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    fullName: "", address: "", citizenshipNo: "", contactNo: "", fatherName: "", motherName: "",
  });

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setLoading(false);
      return;
    }

    const kycRef = ref(database, `users/${currentUser.uid}/kyc`);
    const unsubscribe = onValue(kycRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val() as KycData;
        setKyc(data);
        setFormData({
          fullName: data.fullName || "",
          address: data.address || "",
          citizenshipNo: data.citizenshipNo || "",
          contactNo: data.contactNo || "",
          fatherName: data.fatherName || "",
          motherName: data.motherName || "",
        });
      } else {
        setKyc({ status: "Not Submitted" });
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };
  
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setError("You must be logged in to submit KYC.");
      return;
    }

    for (const key in formData) {
      if (!formData[key as keyof typeof formData].trim()) {
        setError(`Please fill out all fields.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const kycPayload: KycData & { status: "Pending" } = {
        ...formData,
        status: "Pending",
      };

      const updates: Record<string, unknown> = {};
      updates[`/users/${currentUser.uid}/kyc`] = kycPayload;
      updates[`/kycRequests/${currentUser.uid}`] = {
        ...kycPayload,
        userName: (auth.currentUser?.displayName || formData.fullName),
        submittedAt: new Date().toISOString(),
      };
      
      await update(ref(database), updates);

      setSuccess("Your KYC details have been submitted for review!");

    } catch (err) {
      console.error("KYC submission error:", err);
      setError("Failed to submit KYC. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading KYC status...</div>;
  }

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">KYC Verification</h1>
        <p className="mt-2 text-slate-600">Submit your details to get your account fully verified.</p>
      </header>

      <div className="space-y-8 max-w-3xl">
        <StatusCard status={kyc?.status || "Not Submitted"} />
        
        {kyc?.status !== "Approved" && (
          <form onSubmit={handleSubmit} className="rounded-lg border bg-white p-6 shadow-sm space-y-6">
            <h3 className="text-lg font-semibold border-b pb-3 text-slate-800">
              {kyc?.status === "Rejected" ? "Re-submit Your Details" : "Submit Your Details"}
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <InputField label="Full Name" id="fullName" value={formData.fullName} onChange={handleInputChange} required />
              <InputField label="Contact Number" id="contactNo" value={formData.contactNo} onChange={handleInputChange} required />
            </div>
            
            <InputField label="Full Address" id="address" value={formData.address} onChange={handleInputChange} required />
            <InputField label="Citizenship / License  / Birth Certificate No." id="citizenshipNo" value={formData.citizenshipNo} onChange={handleInputChange} required />
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <InputField label="Father's Name" id="fatherName" value={formData.fatherName} onChange={handleInputChange} required />
              <InputField label="Mother's Name" id="motherName" value={formData.motherName} onChange={handleInputChange} required />
            </div>

            {error && <p className="text-sm font-semibold text-red-600 text-center p-3 bg-red-50 border border-red-200 rounded-md">{error}</p>}
            {success && <p className="text-sm font-semibold text-green-600 text-center p-3 bg-green-50 border border-green-200 rounded-md">{success}</p>}
            
            <button 
              type="submit" 
              disabled={isSubmitting} 
              className="w-full rounded-md bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:bg-sky-400 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Submitting for Review..." : "Submit for Review"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// Reusable Helper Components
function StatusCard({ status }: { status: KycStatus }) {
  let bgColor = "bg-slate-100", textColor = "text-slate-800", borderColor = "border-slate-200";
  if (status === "Approved") { bgColor = "bg-green-50"; textColor = "text-green-800"; borderColor = "border-green-200"; }
  if (status === "Pending") { bgColor = "bg-yellow-50"; textColor = "text-yellow-800"; borderColor = "border-yellow-200"; }
  if (status === "Rejected") { bgColor = "bg-red-50"; textColor = "text-red-800"; borderColor = "border-red-200"; }
  
  return (
    <div className={`rounded-lg p-6 shadow-sm border ${borderColor} ${bgColor}`}>
      <h3 className={`font-semibold text-lg ${textColor}`}>KYC Status: {status}</h3>
      {status === "Rejected" && <p className={`mt-1 text-sm ${textColor.replace('800', '700')}`}>Your previous submission was rejected. Please review your details and re-submit.</p>}
    </div>
  );
}

function InputField({ id, label, ...props }: { id: string, label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      <input 
        id={id} 
        {...props} 
        className="mt-1 w-full rounded-md border-slate-300 shadow-sm focus:border-sky-500 focus:ring-sky-500" 
      />
    </div>
  );
}