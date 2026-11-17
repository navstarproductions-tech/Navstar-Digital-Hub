export function passwordPolicyError(password) {
  if (password.length < 6 || password.length > 12) return 'Password must contain 6–12 characters.';
  const categories = [/[A-Z]/.test(password), /[a-z]/.test(password), /[0-9]/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length;
  if (categories < 3) return 'Use at least 3 of these 4 types: uppercase letter, lowercase letter, number, and special character (for example ! or @).';
  return '';
}
