const modules = {
  fracture: {
    code: "MODULE / 01",
    title: "灰岩压裂三维可视化",
    description: "交互调节地质、力学与施工参数，观察裂缝网络响应。",
    href: "./fracture/",
  },
  macd: {
    code: "MODULE / 02",
    title: "压裂施工曲线 MACD 分析",
    description: "导入时间、压力、排量与砂浓度数据，识别趋势和动能变化。",
    href: "./fracpulse/",
  },
};

const tabs = [...document.querySelectorAll(".module-tab")];
const panels = [...document.querySelectorAll(".module-panel")];
const activeCode = document.querySelector("#activeCode");
const activeTitle = document.querySelector("#activeTitle");
const activeDescription = document.querySelector("#activeDescription");
const openModule = document.querySelector("#openModule");

function activateModule(name, updateHash = true) {
  const config = modules[name];
  if (!config) return;

  for (const tab of tabs) {
    const selected = tab.dataset.module === name;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }

  for (const panel of panels) {
    const selected = panel.id === `panel-${name}`;
    panel.hidden = !selected;
    panel.classList.toggle("active", selected);
    if (selected) {
      const frame = panel.querySelector("iframe");
      if (!frame.getAttribute("src") && frame.dataset.src) frame.src = frame.dataset.src;
    }
  }

  activeCode.textContent = config.code;
  activeTitle.textContent = config.title;
  activeDescription.textContent = config.description;
  openModule.href = config.href;

  if (updateHash) history.replaceState(null, "", `#${name}`);
}

for (const tab of tabs) {
  tab.addEventListener("click", () => activateModule(tab.dataset.module));
  tab.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const current = tabs.indexOf(tab);
    const next = event.key === "ArrowRight" ? (current + 1) % tabs.length : (current - 1 + tabs.length) % tabs.length;
    tabs[next].focus();
    activateModule(tabs[next].dataset.module);
  });
}

const initialModule = location.hash.slice(1);
activateModule(modules[initialModule] ? initialModule : "fracture", false);
