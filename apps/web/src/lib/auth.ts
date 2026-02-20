export function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  let score = 0;

  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;

  if (score <= 1) return { score, label: 'Weak', color: '#e17055' };
  if (score <= 2) return { score, label: 'Fair', color: '#fdcb6e' };
  if (score <= 3) return { score, label: 'Good', color: '#00cec9' };
  if (score <= 4) return { score, label: 'Strong', color: '#00b894' };
  return { score, label: 'Very Strong', color: '#00b894' };
}
