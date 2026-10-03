import { redirect } from 'react-router'

export async function loader() {
  return redirect('/members/dashboard')
}

export default function MembersIndex() {
  return null
}
