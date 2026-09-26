import axios from 'axios'

async function main() {
  const res = await axios.get('https://dev.mercon.tech/api/customers?per_page=100')
  const customers = res.data.data
  console.log("Customers on dev server:")
  console.log(customers.map((c: any) => c.name))
}
main().catch(console.error)
