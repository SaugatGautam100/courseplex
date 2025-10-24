"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { ref, onValue } from "firebase/database";
import { auth, database } from "@/lib/firebase";

type UserProfile = {
  status: "active" | "pending_approval" | null;
  name?: string;
  imageUrl?: string;
};

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      console.log('onAuthStateChanged fired:', currentUser?.email || 'null'); // DEBUG: Remove after testing
      setUser(currentUser);
      
      // FIXED: Set loading false IMMEDIATELY after auth state (non-blocking)
      setLoading(false);
      
      if (currentUser) {
        const profileRef = ref(database, `users/${currentUser.uid}`);
        const unsubscribeProfile = onValue(profileRef, (snapshot) => {
          try {
            setProfile(snapshot.exists() ? snapshot.val() : null);
          } catch (error) {
            console.error('Profile fetch error:', error); // DEBUG: Handle fetch errors
            setProfile(null);
          }
        }, (error) => {
          console.error('Profile listener error:', error); // Handle listener errors
          setProfile(null);
        });
        return () => unsubscribeProfile();
      } else {
        setProfile(null);
      }
    });
    return () => unsubscribe();
  }, []);

  return { user, profile, loading };
}