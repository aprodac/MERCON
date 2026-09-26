import axios from 'axios'
async function main() {
  try {
    const res = await axios.post('https://dev.mercon.tech/api/auth/login', {
      username: 'admin',
      password: 'password'
    })
    console.log(res.data)
  } catch (e: any) {
    console.log(e.response?.data)
  }
}
main()
