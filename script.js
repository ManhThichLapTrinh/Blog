// =====================
// SLIDER BANNER (auto, 4s)
// =====================
(() => {
  const slides = document.querySelectorAll(".slide");
  if (!slides.length) return;

  let idx = 0;

  const show = (i) => {
    slides.forEach((el, k) => {
      el.style.display = k === i ? "block" : "none";
    });
  };

  show(idx); // khởi tạo
  setInterval(() => {
    idx = (idx + 1) % slides.length;
    show(idx);
  }, 4000);
})();

// =====================
// LỊCH TUẦN (LocalStorage)
// =====================
(() => {
  const scheduleList = document.getElementById("schedule-list");
  const form = document.getElementById("schedule-form");
  const showFormBtn = document.getElementById("show-form-btn");
  const dateInput = document.getElementById("date");
  const timeInput = document.getElementById("time");
  const eventInput = document.getElementById("event");

  if (!scheduleList || !form || !showFormBtn || !dateInput || !timeInput || !eventInput) return;

  // ISO week đơn giản (tương đối)
  function getWeekNumber(date) {
    const firstDay = new Date(date.getFullYear(), 0, 1);
    const pastDays = Math.floor((date - firstDay) / 86400000);
    return Math.ceil((pastDays + firstDay.getDay() + 1) / 7);
  }

  const currentWeek = getWeekNumber(new Date());
  const STORAGE_KEY = "scheduleData";

  let savedData;
  try {
    savedData = JSON.parse(localStorage.getItem(STORAGE_KEY)) || { week: currentWeek, schedule: [] };
  } catch {
    savedData = { week: currentWeek, schedule: [] };
  }

  // Sang tuần mới thì reset
  if (savedData.week !== currentWeek) {
    savedData = { week: currentWeek, schedule: [] };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedData));
  }

  function renderSchedule() {
    scheduleList.innerHTML = "";
    if (!savedData.schedule.length) {
      scheduleList.innerHTML = "<li>Chưa có sự kiện nào trong tuần này</li>";
      return;
    }
    savedData.schedule.forEach(item => {
      const li = document.createElement("li");
      li.textContent = `${item.date} - ${item.time} - ${item.event}`;
      scheduleList.appendChild(li);
    });
  }

  renderSchedule();

  // Toggle form
  showFormBtn.addEventListener("click", () => {
    const visible = form.style.display !== "none";
    form.style.display = visible ? "none" : "flex";
  });

  // Thêm lịch
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const newEvent = {
      date: dateInput.value,
      time: timeInput.value,
      event: eventInput.value.trim()
    };
    if (!newEvent.date || !newEvent.time || !newEvent.event) return;

    savedData.schedule.push(newEvent);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedData));

    renderSchedule();
    form.reset();
    form.style.display = "none";
  });
})();

// =====================
// TRUYỆN ĐÃ ĐĂNG (LocalStorage -> sidebar)
// =====================
(() => {
  const storyListSidebar = document.querySelector("aside.sidebar ul");
  const heading = storyListSidebar?.parentElement?.querySelector("h3")?.textContent || "";

  if (!storyListSidebar || !/Truyện đã đăng/i.test(heading)) return;

  let savedStories = [];
  try {
    savedStories = JSON.parse(localStorage.getItem("storyData")) || [];
  } catch {
    savedStories = [];
  }

  storyListSidebar.innerHTML = "";

  if (!savedStories.length) {
    storyListSidebar.innerHTML = "<li>Chưa có truyện nào</li>";
    return;
  }

  savedStories.forEach((story, index) => {
    const li = document.createElement("li");
    const title = (story && story.title) ? story.title : `Truyện #${index + 1}`;
    li.innerHTML = `<a href="./doc-truyen/doc-truyen.html?story=${index}&chapter=0">${title}</a>`;
    storyListSidebar.appendChild(li);
  });
})();

/* 
// LƯU Ý: Đoạn này bị lỗi vì loginBtn chưa được khai báo trong file này
// loginBtn.classList.add('login-btn--signedin');
*/




