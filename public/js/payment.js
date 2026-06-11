const stripe = Stripe(STRIPE_PUBLIC_KEY);

let card;
let clientSecret;

document.addEventListener("DOMContentLoaded", async () => {

  const res = await fetch("/api/create-setup-intent");
  const data = await res.json();

  clientSecret = data.clientSecret;

  const elements = stripe.elements();
  card = elements.create("card");

  card.mount("#card-element");
});

async function saveCard() {

  const { setupIntent, error } = await stripe.confirmCardSetup(
    clientSecret,
    {
      payment_method: {
        card
      }
    }
  );

  if (error) return alert(error.message);

  alert("Card saved ✔");
}