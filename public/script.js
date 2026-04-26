let cart = [];
let allProducts = [];
let allProductsOriginal = [];
let currentCategory = 'all';
let currentSubType = 'all';
let razorpayKeyId = '';

fetch('/config')
  .then(res => res.json())
  .then(cfg => { razorpayKeyId = cfg.razorpayKeyId; })
  .catch(() => {});

// ======================
// ✅ FETCH PRODUCTS
// ======================
fetch('/products')
  .then(res => res.json())
  .then(data => {

    allProducts = (data || []).map(p => ({
      ...p,
      createdAt: p.createdAt || Date.now()
    //   popularity: p.popularity || Math.floor(Math.random() * 100)
    }));

    allProductsOriginal = [...allProducts];

    displayProducts(allProducts);
  })
  .catch(err => {
    console.error("Error loading products:", err);
  });


// ======================
// ✅ DISPLAY PRODUCTS
// ======================
function displayProducts(products) {
  const container = document.getElementById('products');
  container.innerHTML = "";

  if (!products || products.length === 0) {
    container.innerHTML = `
        <div class="empty-state">
        <h3>No products found 😕</h3>
        <p>Try changing filters or explore other collections</p>
        </div>
    `;
    return;
}

  // helper: check new product
  const isNew = (timestamp) => {
    const days = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
    return days <= 7;
  };

  products.forEach(p => {
    const card = document.createElement("div");
    card.className = "product fade-in";

    // ✅ badge logic
    let badge = "";

    // if ((p.popularity || 0) > 80) {
    //   badge = "🔥 Bestseller";
    // } else 
    // if (isNew(p.createdAt)) {
    //   badge = "🆕 New";
    // }

    card.innerHTML = `
      ${badge ? `<span class="badge">${badge}</span>` : ""}
      <img>
      <h3></h3>
      <p></p>
      <button>Add to Cart</button>
      <button>Buy Now</button>
    `;

    card.querySelector("img").src = p.image;
    card.querySelector("h3").textContent = p.name;
    card.querySelector("p").textContent = `₹${p.price}`;

    // modal open
    card.onclick = () => openProduct(p.name, p.price, p.image);

    // add to cart
    card.querySelectorAll("button")[0].onclick = (e) => {
      e.stopPropagation();
      addToCart(p.name, p.price, p.image);
    };

    // buy now
    card.querySelectorAll("button")[1].onclick = (e) => {
      e.stopPropagation();
      order(p.name, p.price);
    };

    container.appendChild(card);
  });

  // fade-in animation
  setTimeout(() => {
    document.querySelectorAll('.fade-in')
      .forEach(el => el.classList.add('show'));
  }, 50);
}


// ======================
// ✅ SORT PRODUCTS
// ======================
function sortProducts() {
  let filtered;

  if (currentCategory === 'all') {
    filtered = [...allProducts];
  } else if (currentCategory === 'saree') {
    filtered = currentSubType === 'all'
      ? allProducts.filter(p => p.category === 'saree')
      : allProducts.filter(p => p.category === 'saree' && p.type === currentSubType);
  } else {
    filtered = allProducts.filter(p => p.category === currentCategory);
  }

  applySortAndRender(filtered);
}


// ======================
// ✅ PRODUCT MODAL
// ======================
function openProduct(name, price, image) {
  document.getElementById("product-modal").classList.add("show");

  document.getElementById("modal-img").src = image;
  document.getElementById("modal-name").innerText = name;
  document.getElementById("modal-price").innerText = "₹" + price;

  document.getElementById("modal-cart").onclick = () => addToCart(name, price, image);
  document.getElementById("modal-buy").onclick = () => order(name, price);
}

function closeModal() {
  document.getElementById("product-modal").classList.remove("show");
}


// ======================
// ✅ FILTER CATEGORY
// ======================
function filterProducts(category, element) {

  currentCategory = category;
  currentSubType = 'all';

  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));

  if (element) element.classList.add('active');

  const subContainer = document.getElementById("subcategories");

  if (category === 'saree') {

    subContainer.innerHTML = `
      <span class="sub-tab active" onclick="filterSub('all', this)">All</span>
      <span class="sub-tab" onclick="filterSub('kanchi', this)">Kanchi</span>
      <span class="sub-tab" onclick="filterSub('linen', this)">Linen</span>
      <span class="sub-tab" onclick="filterSub('mulcotton', this)">Mul Cotton</span>
    `;

    filterSub('all');

  } else {
    subContainer.innerHTML = "";

    let filtered = category === 'all'
      ? allProducts
      : allProducts.filter(p => p.category === category);

    displayProducts(filtered);
  }
}


// ======================
// ✅ SUB FILTER (SAREES)
// ======================
function filterSub(type, element) {

  currentSubType = type;

  document.querySelectorAll('.sub-tab').forEach(tab => {
    tab.classList.remove('active');
  });

  if (element) element.classList.add('active');

  let filtered;

  if (type === 'all') {
    filtered = allProducts.filter(p => p.category === 'saree');
  } else {
    filtered = allProducts.filter(p =>
      p.category === 'saree' && p.type === type
    );
  }

  applySortAndRender(filtered);
}


// ======================
// ✅ APPLY SORT AFTER FILTER
// ======================
function applySortAndRender(products) {
  const value = document.getElementById("sortSelect").value;

  switch (value) {
    case "priceLowHigh":
      products.sort((a, b) => a.price - b.price);
      break;

    case "priceHighLow":
      products.sort((a, b) => b.price - a.price);
      break;

    case "nameAZ":
      products.sort((a, b) => a.name.localeCompare(b.name));
      break;

    case "nameZA":
      products.sort((a, b) => b.name.localeCompare(a.name));
      break;

    case "new":
      products.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      break;
  }

  displayProducts(products);
}


// ======================
// ✅ SCROLL
// ======================
function scrollToProducts() {
  document.getElementById("products").scrollIntoView({
    behavior: "smooth"
  });
}


// ======================
// ✅ CART
// ======================
function addToCart(name, price, image) {
  const existing = cart.find(item => item.name === name);

  if (existing) {
    existing.qty++;
  } else {
    cart.push({ name, price, image, qty: 1 });
  }

  updateCart();
  showCartPopup({ name, image });
}

function updateCart() {
  const cartItems = document.getElementById("cart-items");
  const cartCount = document.getElementById("cart-count");
  const total = document.getElementById("total");

  cartItems.innerHTML = "";

  if (cart.length === 0) {
    cartItems.innerHTML = `
      <p style="text-align:center; margin-top:50px;">
        Your cart is empty 🛍️ <br><br>
        Start shopping beautiful collections 💜
      </p>
    `;
    cartCount.innerText = 0;
    total.innerText = "Total: ₹0";
    return;
  }

  let sum = 0;

  cart.forEach((item, index) => {
    sum += item.price * item.qty;

    cartItems.innerHTML += `
      <div class="cart-item">
        <img src="${item.image}" class="cart-img">

        <div class="cart-details">
          <strong>${item.name}</strong>
          <p>₹${item.price}</p>

          <div class="qty">
            <button onclick="decreaseQty(${index})">-</button>
            <span>${item.qty}</span>
            <button onclick="increaseQty(${index})">+</button>
          </div>
        </div>
      </div>
    `;
  });

  cartCount.innerText = cart.reduce((sum, item) => sum + item.qty, 0);
  total.innerText = "Total: ₹" + sum;
}


// ======================
// ➕ QTY
// ======================
function increaseQty(index) {
  cart[index].qty++;
  updateCart();
}

function decreaseQty(index) {
  if (cart[index].qty > 1) {
    cart[index].qty--;
  } else {
    cart.splice(index, 1);
  }
  updateCart();
}


// ======================
// 🛒 CART TOGGLE
// ======================
function toggleCart() {
  document.getElementById("cart").classList.toggle("show");
}

function showToast(message) {
  const toast = document.getElementById("toast");

  toast.innerHTML = `
    <span style="margin-right:8px;">🛍️</span> ${message}
  `;

  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2000);
}

function showCartPopup(product) {
  const popup = document.getElementById("cart-popup");

  document.getElementById("popup-img").src = product.image;
  document.getElementById("popup-name").innerText = product.name;

  popup.classList.add("show");

  setTimeout(() => {
    popup.classList.remove("show");
  }, 2500);
}


// ======================
// 💳 CHECKOUT / BUY NOW → ADDRESS → PAYMENT
// ======================
let pendingOrder = null;

function checkout() {
  if (cart.length === 0) {
    alert("Cart is empty 😅");
    return;
  }
  const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  pendingOrder = { items: [...cart], total };
  showAddressModal();
}

function order(name, price) {
  pendingOrder = { items: [{ name, price, qty: 1 }], total: price };
  showAddressModal();
}

function showAddressModal() {
  document.getElementById('address-modal').classList.add('show');
}

function closeAddressModal() {
  document.getElementById('address-modal').classList.remove('show');
}

function submitAddress(e) {
  e.preventDefault();
  const address = {
    name:    document.getElementById('addr-name').value.trim(),
    phone:   document.getElementById('addr-phone').value.trim(),
    line:    document.getElementById('addr-line').value.trim(),
    city:    document.getElementById('addr-city').value.trim(),
    state:   document.getElementById('addr-state').value.trim(),
    pincode: document.getElementById('addr-pincode').value.trim(),
  };
  closeAddressModal();
  processPayment(address);
}

function processPayment(address) {
  fetch('/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...pendingOrder, address })
  })
  .then(res => res.json())
  .then(data => {
    const options = {
      key: razorpayKeyId,
      amount: data.amount,
      currency: "INR",
      name: "Ethniq Loom",
      description: "Order Payment",
      order_id: data.razorpayOrderId,
      handler: function (response) {
        fetch('/verify-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            razorpay_order_id:   response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature:  response.razorpay_signature,
          })
        })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            alert("🎉 Order placed successfully!");
            cart = [];
            updateCart();
            pendingOrder = null;
          } else {
            alert("Payment could not be verified. Please contact support.");
          }
        })
        .catch(() => {
          alert("Could not verify payment. Please contact support.");
        });
      }
    };
    const rzp = new Razorpay(options);
    rzp.open();
  })
  .catch(err => {
    console.error("Payment error:", err);
    alert("Something went wrong. Please try again.");
  });
}