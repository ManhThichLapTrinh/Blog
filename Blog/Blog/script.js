// Slider banner
let slideIndex = 0;
showSlides();

function showSlides() {
  let slides = document.getElementsByClassName("slide");
  for (let i = 0; i < slides.length; i++) {
    slides[i].style.display = "none";
  }
  slideIndex++;
  if (slideIndex > slides.length) {
    slideIndex = 1;
  }
  slides[slideIndex - 1].style.display = "block";
  setTimeout(showSlides, 4000); // đổi ảnh sau 4 giây
}

setInterval(() => {
  currentSlide = (currentSlide + 1) % slides.length;
  showSlide(currentSlide);
}, 4000);


//Phần Lịch học
const scheduleList = document.getElementById("schedule-list");
  const form = document.getElementById("schedule-form");
  const showFormBtn = document.getElementById("show-form-btn");
  const dateInput = document.getElementById("date");
  const timeInput = document.getElementById("time");
  const eventInput = document.getElementById("event");

  // Hàm lấy số tuần trong năm
  function getWeekNumber(date) {
    const firstDay = new Date(date.getFullYear(), 0, 1);
    const pastDays = Math.floor((date - firstDay) / 86400000);
    return Math.ceil((pastDays + firstDay.getDay() + 1) / 7);
  }

  // Tuần hiện tại
  const currentWeek = getWeekNumber(new Date());

  // Lấy dữ liệu lịch từ LocalStorage
  let savedData = JSON.parse(localStorage.getItem("scheduleData")) || { week: currentWeek, schedule: [] };

  // Nếu sang tuần mới → reset
  if (savedData.week !== currentWeek) {
    savedData = { week: currentWeek, schedule: [] };
    localStorage.setItem("scheduleData", JSON.stringify(savedData));
  }

  // Render lịch ra màn hình
  function renderSchedule() {
    scheduleList.innerHTML = "";
    savedData.schedule.forEach(item => {
      const li = document.createElement("li");
      li.textContent = `${item.date} - ${item.time} - ${item.event}`;
      scheduleList.appendChild(li);
    });
  }
  renderSchedule();

  // Hiện/ẩn form khi nhấn nút
  showFormBtn.addEventListener("click", () => {
    form.style.display = form.style.display === "none" ? "flex" : "none";
  });

  // Thêm lịch mới
  form.addEventListener("submit", function(e) {
    e.preventDefault();

    const newEvent = {
      date: dateInput.value,
      time: timeInput.value,
      event: eventInput.value
    };

    savedData.schedule.push(newEvent);
    localStorage.setItem("scheduleData", JSON.stringify(savedData));

    renderSchedule();
    form.reset();
    form.style.display = "none";
  });

// =================== TRUYỆN ĐÃ ĐĂNG ===================
document.addEventListener("DOMContentLoaded", () => {
  const storyListSidebar = document.querySelector("aside.sidebar ul");

  // Nếu sidebar này là "Truyện đã đăng" mới render
  if (storyListSidebar && storyListSidebar.parentElement.querySelector("h3").textContent.includes("Truyện đã đăng")) {
    
    // Lấy dữ liệu truyện từ LocalStorage
    const savedStories = JSON.parse(localStorage.getItem("storyData")) || [];

    // Xóa danh sách mặc định
    storyListSidebar.innerHTML = "";

    if (savedStories.length === 0) {
      storyListSidebar.innerHTML = "<li>Chưa có truyện nào</li>";
      return;
    }

    // Render danh sách truyện
    savedStories.forEach((story, index) => {
      const li = document.createElement("li");

      // Link sang trang đọc truyện (doc-truyen.html) và truyền index qua URL
      li.innerHTML = `
        <a href="./doc-truyen/doc-truyen.html?story=${index}&chapter=0">
          ${story.title}
        </a>
      `;

      storyListSidebar.appendChild(li);
    });
  }
});
