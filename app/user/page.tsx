import { redirect } from 'next/navigation';

export default function Page() {
  // This function immediately triggers a server-side redirect.
  // The user's browser will be sent to the '/admin/orders' page.
  redirect('/user/dashboard');

  // Note: Because redirect() throws a special Next.js exception,
  // the code below this line will never run, and no component will be rendered.
  // You can return null or an empty div to satisfy TypeScript.
  return null;
}