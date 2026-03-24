var STORAGE_KEY = "minimalist_mobile_tasks_v2";
var PULL_TRIGGER = 88;
var RIGHT_COMPLETE_MIN = 128;
var RIGHT_COMPLETE_RATIO = 0.4;
var LONG_PRESS_MS = 320;
var DOUBLE_TAP_MS = 460;
var DOUBLE_TAP_DISTANCE = 48;
var IS_TOUCH_DEVICE = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;

var GROUP_LABELS = {
    none: "",
    study: "study",
    entertainment: "entertainment",
    withme: "withme"
};

var state = {
    tasks: normalizeTasks(loadTasks()),
    pulling: false,
    pullStartY: 0,
    selectedTaskId: null,
    lastTapTaskId: null,
    lastTapAt: 0,
    lastTapX: 0,
    lastTapY: 0,
    ignoreClickUntil: 0,
    currentMoreTaskId: null,
    moved: false,
    gesture: {
        item: null,
        card: null,
        startX: 0,
        startY: 0,
        deltaX: 0,
        rawDeltaX: 0,
        longPressTimer: null,
        dragging: false,
        dragPlaceholder: null,
        dragOffsetY: 0,
        dragStartTop: 0,
        dragStartLeft: 0,
        dragWidth: 0,
        pointerY: 0
    }
};

var reminderTimers = {};
var toastTimer = null;
var undoTimer = null;
var pendingUndoDelete = null;

var pullHint = document.getElementById("pullHint");
var composer = document.getElementById("composer");
var newTaskInput = document.getElementById("newTaskInput");
var emptyHint = document.getElementById("emptyHint");
var taskList = document.getElementById("taskList");
var taskTemplate = document.getElementById("taskTemplate");
var moreSheet = document.getElementById("moreSheet");
var closeMoreBtn = document.getElementById("closeMore");
var sheetBackdrop = document.getElementById("sheetBackdrop");
var sheetTaskPreview = document.getElementById("sheetTaskPreview");
var tagActions = document.getElementById("tagActions");
var groupActions = document.getElementById("groupActions");
var pinToggle = document.getElementById("pinToggle");
var dueYear = document.getElementById("dueYear");
var dueMonth = document.getElementById("dueMonth");
var dueDay = document.getElementById("dueDay");
var dueHour = document.getElementById("dueHour");
var dueMinute = document.getElementById("dueMinute");
var saveDueBtn = document.getElementById("saveDue");
var clearDueBtn = document.getElementById("clearDue");
var renameTaskInput = document.getElementById("sheetTaskNameInput");
var saveTaskNameBtn = document.getElementById("saveTaskName");
var toast = document.getElementById("toast");
var toastText = document.getElementById("toastText");
var toastUndo = document.getElementById("toastUndo");
var dateDisplay = document.getElementById("dateDisplay");
var hourBtn = document.getElementById("hourBtn");
var minuteBtn = document.getElementById("minuteBtn");
var calendarBtn = document.getElementById("calendarBtn");
var calendarModal = document.getElementById("calendarModal");
var dueNativeInput = document.getElementById("dueNativeInput");
var calendarBackdrop = document.getElementById("calendarBackdrop");
var calendarPrevMonth = document.getElementById("calendarPrevMonth");
var calendarNextMonth = document.getElementById("calendarNextMonth");
var calendarTitle = document.getElementById("calendarTitle");
var calendarDates = document.getElementById("calendarDates");
var calendarClose = document.getElementById("calendarClose");

var calendarState = {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1
};

init();

function init() {
    initDueWheel();
    render();
    bindAppEvents();
    scheduleAllReminders();
}

function bindAppEvents() {
    document.addEventListener("touchstart", handlePullStart, { passive: true });
    document.addEventListener("touchmove", handlePullMove, { passive: false });
    document.addEventListener("touchend", handlePullEnd);

    newTaskInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            commitComposerInput();
        }
        if (event.key === "Escape") {
            newTaskInput.value = "";
            closeComposer();
        }
    });

    newTaskInput.addEventListener("blur", function () {
        if (!composer.classList.contains("open")) {
            return;
        }
        commitComposerInput();
    });

    document.addEventListener("pointerdown", function (event) {
        if (!composer.classList.contains("open")) {
            return;
        }
        if (composer.contains(event.target)) {
            return;
        }
        commitComposerInput();
    });

    closeMoreBtn.addEventListener("click", closeMore);
    sheetBackdrop.addEventListener("click", closeMore);

    tagActions.addEventListener("click", function (event) {
        var button = event.target.closest("button[data-tag]");
        if (!button || !state.currentMoreTaskId) {
            return;
        }
        updateTask(state.currentMoreTaskId, { tag: button.dataset.tag });
        syncMoreSheetState();
        showToast("标签已更新");
    });

    groupActions.addEventListener("click", function (event) {
        var button = event.target.closest("button[data-group]");
        if (!button || !state.currentMoreTaskId) {
            return;
        }
        updateTask(state.currentMoreTaskId, { group: button.dataset.group });
        syncMoreSheetState();
        showToast("分组已更新");
    });

    pinToggle.addEventListener("click", function () {
        if (!state.currentMoreTaskId) {
            return;
        }
        var task = findTask(state.currentMoreTaskId);
        if (!task) {
            return;
        }
        updateTask(state.currentMoreTaskId, { pinned: !task.pinned });
        syncMoreSheetState();
        showToast(task.pinned ? "已取消置顶" : "已设为置顶");
    });

    saveDueBtn.addEventListener("click", function () {
        if (!state.currentMoreTaskId) {
            return;
        }
        var ms = getDueWheelMs();
        if (!ms || ms <= Date.now()) {
            showToast("请选择未来时间");
            return;
        }

        updateTask(state.currentMoreTaskId, {
            dueAt: ms,
            notifiedAt: null
        });

        requestNotificationPermissionIfNeeded();
        syncMoreSheetState();
        showToast("提醒时间已保存");
    });

    clearDueBtn.addEventListener("click", function () {
        if (!state.currentMoreTaskId) {
            return;
        }
        updateTask(state.currentMoreTaskId, {
            dueAt: null,
            notifiedAt: null
        });
        setDueWheelFromMs(Date.now());
        syncMoreSheetState();
        showToast("提醒已清除");
    });

    if (saveTaskNameBtn) {
        saveTaskNameBtn.addEventListener("click", function () {
            saveTaskNameFromSheet();
        });
    }

    if (renameTaskInput) {
        renameTaskInput.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                saveTaskNameFromSheet();
            }
        });
    }

    if (toastUndo) {
        toastUndo.addEventListener("click", function () {
            restoreDeletedTask();
        });
    }
}

function handlePullStart(event) {
    if (window.scrollY !== 0) {
        return;
    }
    if (isInteractiveTarget(event.target)) {
        return;
    }
    state.pulling = true;
    state.pullStartY = event.touches[0].clientY;
}

function handlePullMove(event) {
    if (!state.pulling) {
        return;
    }

    var touch = event.touches[0];
    var deltaY = touch.clientY - state.pullStartY;

    if (deltaY <= 0) {
        return;
    }

    event.preventDefault();

    var damped = Math.min(deltaY * 0.52, 120);
    pullHint.classList.add("visible");
    pullHint.style.transform = "translateY(" + (damped - 22) + "px)";

    if (deltaY > PULL_TRIGGER) {
        pullHint.classList.add("ready");
        pullHint.querySelector(".pull-label").textContent = "松手添加任务";
    } else {
        pullHint.classList.remove("ready");
        pullHint.querySelector(".pull-label").textContent = "下拉添加任务";
    }
}

function handlePullEnd(event) {
    if (!state.pulling) {
        return;
    }

    var endY = event.changedTouches[0].clientY;
    var deltaY = endY - state.pullStartY;
    state.pulling = false;

    pullHint.style.transform = "translateY(-22px)";
    pullHint.classList.remove("ready");
    setTimeout(function () {
        pullHint.classList.remove("visible");
    }, 160);

    if (deltaY > PULL_TRIGGER) {
        openComposer();
    }
}

function render() {
    taskList.innerHTML = "";
    getDisplayTasks().forEach(function (task) {
        taskList.appendChild(createTaskElement(task));
    });

    if (state.tasks.length === 0) {
        emptyHint.classList.add("show");
        emptyHint.setAttribute("aria-hidden", "false");
    } else {
        emptyHint.classList.remove("show");
        emptyHint.setAttribute("aria-hidden", "true");
    }
}

function getDisplayTasks() {
    return state.tasks.slice().sort(function (a, b) {
        if (a.completed !== b.completed) {
            return a.completed ? 1 : -1;
        }
        if (a.pinned !== b.pinned) {
            return a.pinned ? -1 : 1;
        }
        return a.order - b.order;
    });
}

function createTaskElement(task) {
    var fragment = taskTemplate.content.cloneNode(true);
    var item = fragment.querySelector(".task-item");
    var card = fragment.querySelector(".task-card");
    var text = fragment.querySelector(".task-text");
    var tag = fragment.querySelector(".task-tag");
    var groupLine = fragment.querySelector(".task-group");
    var trayMoreBtn = fragment.querySelector(".tray-more");
    var trayDeleteBtn = fragment.querySelector(".tray-delete");

    item.dataset.id = task.id;
    text.textContent = task.text;
    if (task.completed) {
        item.classList.add("completed");
    }
    if (task.pinned) {
        item.classList.add("pinned");
    }
    if (state.selectedTaskId === task.id) {
        item.classList.add("selected");
    }

    renderTag(tag, task.tag);
    groupLine.textContent = buildMetaText(task);

    attachTouchHandlers(item, card);

    trayMoreBtn.addEventListener("click", function (event) {
        event.stopPropagation();
        closeOpenedActions(task.id);
        openMore(task.id);
    });

    trayDeleteBtn.addEventListener("click", function (event) {
        event.stopPropagation();
        deleteTask(task.id, item);
    });

    card.addEventListener("click", function () {
        if (IS_TOUCH_DEVICE) {
            return;
        }
        if (Date.now() < state.ignoreClickUntil) {
            return;
        }
        if (state.moved || state.gesture.dragging) {
            return;
        }
        var now = Date.now();
        if (state.lastTapTaskId === task.id && now - state.lastTapAt < 320) {
            beginEdit(task.id, card, task.text);
            state.lastTapAt = 0;
            state.lastTapTaskId = null;
            return;
        }

        state.selectedTaskId = task.id;
        state.lastTapTaskId = task.id;
        state.lastTapAt = now;
        closeOpenedActions(task.id);
        render();
    });

    card.addEventListener("dblclick", function () {
        state.selectedTaskId = task.id;
        beginEdit(task.id, card, task.text);
    });

    return fragment;
}

function attachTouchHandlers(item, card) {
    card.addEventListener("touchstart", function (event) {
        var touch = event.touches[0];
        closeOpenedActions();
        clearLongPressTimer();
        state.gesture.item = item;
        state.gesture.card = card;
        state.gesture.startX = touch.clientX;
        state.gesture.startY = touch.clientY;
        state.gesture.deltaX = 0;
        state.gesture.rawDeltaX = 0;
        state.gesture.dragging = false;
        state.gesture.pointerY = touch.clientY;
        state.moved = false;
        state.selectedTaskId = item.dataset.id;
        card.style.transition = "none";

        state.gesture.longPressTimer = setTimeout(function () {
            startDrag(item, card, touch.clientY);
        }, LONG_PRESS_MS);
    }, { passive: true });

    card.addEventListener("touchmove", function (event) {
        if (state.gesture.item !== item) {
            return;
        }

        var touch = event.touches[0];
        var dx = touch.clientX - state.gesture.startX;
        var dy = touch.clientY - state.gesture.startY;

        if (state.gesture.dragging) {
            event.preventDefault();
            updateDrag(touch.clientY);
            return;
        }

        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
            clearLongPressTimer();
        }

        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 6) {
            state.gesture.item = null;
            state.gesture.card = null;
            card.style.transition = "transform 0.26s cubic-bezier(0.22, 0.61, 0.36, 1)";
            return;
        }

        if (Math.abs(dx) > 6) {
            state.moved = true;
        }

        state.gesture.rawDeltaX = dx;
        state.gesture.deltaX = applySwipeResistance(dx);
        card.style.transform = "translateX(" + state.gesture.deltaX + "px)";
        event.preventDefault();
    }, { passive: false });

    card.addEventListener("touchend", function () {
        if (state.gesture.item !== item && !state.gesture.dragging) {
            return;
        }
        clearLongPressTimer();

        if (state.gesture.dragging) {
            finishDrag();
            return;
        }

        if (!state.moved && Math.abs(state.gesture.rawDeltaX) < 8) {
            var changedTouch = event.changedTouches && event.changedTouches[0] ? event.changedTouches[0] : null;
            var tapX = changedTouch ? changedTouch.clientX : 0;
            var tapY = changedTouch ? changedTouch.clientY : 0;
            state.ignoreClickUntil = Date.now() + 450;
            handleTapSelectionOrEdit(item.dataset.id, card, tapX, tapY);
            resetCard(item, card);
            return;
        }

        finalizeSwipe(item, card);
    });

    card.addEventListener("touchcancel", function () {
        clearLongPressTimer();
        if (state.gesture.dragging) {
            finishDrag();
            return;
        }
        resetCard(item, card);
    });
}

function startDrag(item, card, pointerY) {
    state.gesture.dragging = true;
    state.gesture.pointerY = pointerY;
    state.moved = true;
    closeComposer();

    var rect = item.getBoundingClientRect();
    state.gesture.dragStartTop = rect.top;
    state.gesture.dragStartLeft = rect.left;
    state.gesture.dragWidth = rect.width;
    state.gesture.dragOffsetY = pointerY - rect.top;

    var placeholder = document.createElement("li");
    placeholder.className = "task-item drag-placeholder";
    placeholder.style.height = rect.height + "px";
    item.parentNode.insertBefore(placeholder, item.nextSibling);
    state.gesture.dragPlaceholder = placeholder;

    item.classList.remove("show-actions");
    item.classList.add("drag-floating");
    item.classList.add("dragging");
    item.style.position = "fixed";
    item.style.left = rect.left + "px";
    item.style.top = rect.top + "px";
    item.style.width = rect.width + "px";
    item.style.margin = "0";
    item.style.zIndex = "80";
    card.style.transform = "translate3d(0,0,0)";
    card.style.transition = "none";
}

function updateDrag(pointerY) {
    var item = state.gesture.item;
    var card = state.gesture.card;
    var placeholder = state.gesture.dragPlaceholder;
    if (!item || !card || !placeholder) {
        return;
    }

    state.gesture.pointerY = pointerY;
    var nextTop = pointerY - state.gesture.dragOffsetY;
    item.style.top = nextTop + "px";

    var siblings = Array.from(taskList.querySelectorAll(".task-item:not(.drag-floating):not(.drag-placeholder)"));
    var insertBefore = null;

    for (var i = 0; i < siblings.length; i++) {
        var siblingRect = siblings[i].getBoundingClientRect();
        if (pointerY < siblingRect.top + siblingRect.height / 2) {
            insertBefore = siblings[i];
            break;
        }
    }

    if (insertBefore) {
        taskList.insertBefore(placeholder, insertBefore);
    } else {
        taskList.appendChild(placeholder);
    }
}

function finishDrag() {
    var item = state.gesture.item;
    var card = state.gesture.card;
    var placeholder = state.gesture.dragPlaceholder;
    if (!item || !card) {
        return;
    }

    if (placeholder && placeholder.parentNode) {
        placeholder.parentNode.insertBefore(item, placeholder);
        placeholder.remove();
    }

    item.style.position = "";
    item.style.left = "";
    item.style.top = "";
    item.style.width = "";
    item.style.margin = "";
    item.style.zIndex = "";
    item.classList.remove("drag-floating");
    item.classList.remove("dragging");
    card.style.transition = "transform 0.26s cubic-bezier(0.22, 0.61, 0.36, 1)";
    card.style.transform = "translateX(0px)";

    saveOrderFromDom();
    persistAndRender();

    resetGestureState();
    setTimeout(function () {
        state.moved = false;
    }, 40);
}

function saveOrderFromDom() {
    var ids = Array.from(taskList.querySelectorAll(".task-item")).map(function (element) {
        return element.dataset.id;
    });

    for (var i = 0; i < ids.length; i++) {
        var task = findTask(ids[i]);
        if (task) {
            task.order = i + 1;
        }
    }
}

function finalizeSwipe(item, card) {
    card.style.transition = "transform 0.26s cubic-bezier(0.22, 0.61, 0.36, 1)";
    var rawDx = state.gesture.rawDeltaX;
    var width = item.offsetWidth || 300;
    var leftDistance = Math.max(0, -rawDx);
    var rightDistance = Math.max(0, rawDx);
    var rightThreshold = Math.max(RIGHT_COMPLETE_MIN, Math.floor(width * RIGHT_COMPLETE_RATIO));
    var stage1Threshold = Math.max(20, width * 0.07);
    var stage2Threshold = Math.max(128, width * 0.42);
    var revealX = -Math.round(width * 0.5);

    if (rightDistance >= rightThreshold) {
        toggleTaskCompletion(item.dataset.id);
        resetCard(item, card);
        return;
    }

    if (leftDistance >= stage2Threshold) {
        deleteTask(item.dataset.id, item, true);
        return;
    }

    if (leftDistance >= stage1Threshold) {
        card.style.transform = "translateX(" + revealX + "px)";
        item.classList.add("show-actions");
        resetGestureState();
        return;
    }

    resetCard(item, card);
}

function resetCard(item, card) {
    card.style.transform = "translateX(0px)";
    item.classList.remove("show-actions");
    resetGestureState();
    setTimeout(function () {
        state.moved = false;
    }, 20);
}

function resetGestureState() {
    state.gesture.item = null;
    state.gesture.card = null;
    state.gesture.deltaX = 0;
    state.gesture.rawDeltaX = 0;
    state.gesture.dragging = false;
    state.gesture.dragPlaceholder = null;
    clearLongPressTimer();
}

function clearLongPressTimer() {
    if (state.gesture.longPressTimer) {
        clearTimeout(state.gesture.longPressTimer);
        state.gesture.longPressTimer = null;
    }
}

function beginEdit(taskId, card, currentText) {
    closeComposer();

    var oldText = card.querySelector(".task-text");
    if (!oldText) {
        return;
    }

    var input = document.createElement("input");
    input.type = "text";
    input.className = "task-edit";
    input.value = currentText;

    card.replaceChild(input, oldText);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    var committed = false;

    function commit() {
        if (committed) {
            return;
        }
        committed = true;
        var value = input.value.trim();
        if (value) {
            updateTask(taskId, { text: value });
        } else {
            render();
        }
    }

    function cancel() {
        if (committed) {
            return;
        }
        committed = true;
        render();
    }

    input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            commit();
        }
        if (event.key === "Escape") {
            event.preventDefault();
            cancel();
        }
    });

    input.addEventListener("blur", commit);
}

function handleTapSelectionOrEdit(taskId, card, tapX, tapY) {
    var task = findTask(taskId);
    if (!task) {
        return;
    }

    var now = Date.now();
    var deltaX = Math.abs((tapX || 0) - state.lastTapX);
    var deltaY = Math.abs((tapY || 0) - state.lastTapY);
    var isSameSpot = deltaX <= DOUBLE_TAP_DISTANCE && deltaY <= DOUBLE_TAP_DISTANCE;

    if (state.lastTapTaskId === taskId && now - state.lastTapAt <= DOUBLE_TAP_MS && isSameSpot) {
        beginEdit(taskId, card, task.text);
        state.lastTapTaskId = null;
        state.lastTapAt = 0;
        state.lastTapX = 0;
        state.lastTapY = 0;
        return;
    }

    setSelectedTaskInDom(taskId);
    state.lastTapTaskId = taskId;
    state.lastTapAt = now;
    state.lastTapX = tapX || 0;
    state.lastTapY = tapY || 0;
    closeOpenedActions(taskId);
}

function setSelectedTaskInDom(taskId) {
    state.selectedTaskId = taskId;
    var items = taskList.querySelectorAll(".task-item");
    items.forEach(function (entry) {
        if (entry.dataset.id === taskId) {
            entry.classList.add("selected");
        } else {
            entry.classList.remove("selected");
        }
    });
}

function addTask(text) {
    state.tasks.push({
        id: uid(),
        text: text,
        completed: false,
        tag: "none",
        group: "none",
        pinned: false,
        dueAt: null,
        notifiedAt: null,
        createdAt: Date.now(),
        order: nextOrder()
    });
    state.selectedTaskId = null;
    persistAndRender();
}

function updateTask(taskId, patch) {
    var task = findTask(taskId);
    if (!task) {
        return;
    }
    Object.keys(patch).forEach(function (key) {
        task[key] = patch[key];
    });
    persistAndRender();
}

function toggleComplete(taskId) {
    var task = findTask(taskId);
    if (!task) {
        return;
    }
    task.completed = !task.completed;
    persistAndRender();
}

function completeTask(taskId) {
    var task = findTask(taskId);
    if (!task) {
        return;
    }
    task.completed = true;
    task.order = nextOrder();
    persistAndRender();
}

function uncompleteTask(taskId) {
    var task = findTask(taskId);
    if (!task) {
        return;
    }
    task.completed = false;
    task.order = nextOrder();
    persistAndRender();
}

function toggleTaskCompletion(taskId) {
    var task = findTask(taskId);
    if (!task) {
        return;
    }

    if (task.completed) {
        uncompleteTask(taskId);
    } else {
        completeTask(taskId);
    }
}

function deleteTask(taskId, item, fromLeft) {
    clearPendingUndoDelete();
    var card = item.querySelector(".task-card");
    var taskIndex = getTaskIndex(taskId);
    var task = taskIndex >= 0 ? state.tasks[taskIndex] : null;
    if (!task) {
        return;
    }
    var taskSnapshot = JSON.parse(JSON.stringify(task));

    if (fromLeft && card) {
        card.style.transition = "transform 0.2s cubic-bezier(0.22, 0.61, 0.36, 1)";
        card.style.transform = "translateX(-" + (item.offsetWidth + 40) + "px)";
    }

    setTimeout(function () {
        item.classList.add(fromLeft ? "removing-left" : "removing");
        setTimeout(function () {
            state.tasks = state.tasks.filter(function (entry) {
                return entry.id !== taskId;
            });
            persistAndRender();
            queueUndoDelete(taskSnapshot, taskIndex);
        }, fromLeft ? 220 : 180);
    }, fromLeft ? 90 : 0);
}

function openMore(taskId) {
    state.currentMoreTaskId = taskId;

    moreSheet.classList.add("open");
    moreSheet.setAttribute("aria-hidden", "false");

    var item = findTaskElement(taskId);
    if (item) {
        var card = item.querySelector(".task-card");
        if (card) {
            card.style.transform = "translateX(0px)";
        }
        item.classList.remove("show-actions");
    }

    syncMoreSheetState();

    if (renameTaskInput) {
        setTimeout(function () {
            renameTaskInput.focus();
        }, 40);
    }
}

function syncMoreSheetState() {
    var task = findTask(state.currentMoreTaskId);
    if (!task) {
        return;
    }

    if (typeof sheetTaskPreview !== "undefined" && sheetTaskPreview) {
        sheetTaskPreview.textContent = task.text;
    }
    pinToggle.textContent = task.pinned ? "取消置顶" : "设为置顶";
    if (task.dueAt) {
        setDueWheelFromMs(task.dueAt);
    } else {
        setDueWheelFromMs(Date.now());
    }
    if (renameTaskInput) {
        renameTaskInput.value = task.text;
    }

    setButtonGroupActive(tagActions, "tag", task.tag || "none");
    setButtonGroupActive(groupActions, "group", task.group || "none");
}

function closeMore() {
    moreSheet.classList.remove("open");
    moreSheet.setAttribute("aria-hidden", "true");
    if (renameTaskInput) {
        renameTaskInput.value = "";
    }
    state.currentMoreTaskId = null;
}

function initDueWheel() {
    if (!dueYear || !dueMonth || !dueDay || !dueHour || !dueMinute) {
        return;
    }

    populateWheelRange(dueYear, 2020, 2035, "年");
    populateWheelRange(dueMonth, 1, 12, "月");
    populateWheelRange(dueHour, 0, 23, ":", true);
    populateWheelRange(dueMinute, 0, 59, "", true);

    dueYear.addEventListener("change", function () {
        refreshDueDays();
        updateDateDisplay();
    });
    dueMonth.addEventListener("change", function () {
        refreshDueDays();
        updateDateDisplay();
    });
    dueDay.addEventListener("change", updateDateDisplay);
    dueHour.addEventListener("change", updateTimeWheelDisplay);
    dueMinute.addEventListener("change", updateTimeWheelDisplay);

    if (hourBtn) {
        hourBtn.addEventListener("click", function () {
            var h = Number(dueHour.value);
            h = (h + 1) % 24;
            dueHour.value = String(h);
            updateTimeWheelDisplay();
        });
    }

    if (minuteBtn) {
        minuteBtn.addEventListener("click", function () {
            var m = Number(dueMinute.value);
            m = (m + 1) % 60;
            dueMinute.value = String(m);
            updateTimeWheelDisplay();
        });
    }

    // 日期选择器事件
    if (IS_TOUCH_DEVICE || /iPhone|iPad|Android/i.test(navigator.userAgent)) {
        // 移动设备：使用原生date picker
        if (calendarBtn && dueNativeInput) {
            calendarBtn.addEventListener("click", function () {
                dueNativeInput.click();
            });
            dueNativeInput.addEventListener("change", function () {
                if (dueNativeInput.value) {
                    var dateParts = dueNativeInput.value.split("-");
                    dueYear.value = dateParts[0];
                    dueMonth.value = dateParts[1].replace(/^0/, '');
                    dueDay.value = dateParts[2].replace(/^0/, '');
                    refreshDueDays();
                    updateDateDisplay();
                }
            });
        }
    } else {
        // 非移动设备：使用自定义日历选择器
        if (calendarBtn) {
            calendarBtn.addEventListener("click", openCalendarModal);
        }
        if (calendarBackdrop) {
            calendarBackdrop.addEventListener("click", closeCalendarModal);
        }
        if (calendarClose) {
            calendarClose.addEventListener("click", closeCalendarModal);
        }
        if (calendarPrevMonth) {
            calendarPrevMonth.addEventListener("click", function () {
                calendarState.month--;
                if (calendarState.month < 1) {
                    calendarState.month = 12;
                    calendarState.year--;
                }
                renderCalendar();
            });
        }
        if (calendarNextMonth) {
            calendarNextMonth.addEventListener("click", function () {
                calendarState.month++;
                if (calendarState.month > 12) {
                    calendarState.month = 1;
                    calendarState.year++;
                }
                renderCalendar();
            });
        }
    }

    setDueWheelFromMs(Date.now());
    updateTimeWheelDisplay();
    updateDateDisplay();
}

function updateTimeWheelDisplay() {
    if (hourBtn) {
        hourBtn.textContent = String(dueHour.value).padStart(2, "0");
    }
    if (minuteBtn) {
        minuteBtn.textContent = String(dueMinute.value).padStart(2, "0");
    }
}

function updateDateDisplay() {
    if (!dueYear || !dueMonth || !dueDay || !dateDisplay) {
        return;
    }
    var year = dueYear.value || "2026";
    var month = String(dueMonth.value || "1").padStart(2, "0");
    var day = String(dueDay.value || "1").padStart(2, "0");
    dateDisplay.textContent = year + "-" + month + "-" + day;
}

function updateDueDisplay() {
    // 这个函数现在不需要了，但保留以兼容性
}

function populateWheelRange(selectEl, start, end, suffix, pad2) {
    selectEl.innerHTML = "";
    for (var value = start; value <= end; value++) {
        var option = document.createElement("option");
        option.value = String(value);
        var label = pad2 ? String(value).padStart(2, "0") : String(value);
        option.textContent = label + suffix;
        selectEl.appendChild(option);
    }
}

function refreshDueDays() {
    if (!dueYear || !dueMonth || !dueDay) {
        return;
    }

    var year = Number(dueYear.value);
    var month = Number(dueMonth.value);
    var currentDay = Number(dueDay.value || "1");
    var maxDay = new Date(year, month, 0).getDate();

    dueDay.innerHTML = "";
    for (var day = 1; day <= maxDay; day++) {
        var option = document.createElement("option");
        option.value = String(day);
        option.textContent = String(day).padStart(2, "0") + "日";
        dueDay.appendChild(option);
    }

    dueDay.value = String(Math.min(currentDay, maxDay));
}

function setDueWheelFromMs(ms) {
    if (!dueYear || !dueMonth || !dueDay || !dueHour || !dueMinute) {
        return;
    }
    var date = new Date(ms);
    dueYear.value = String(date.getFullYear());
    if (!dueYear.value) {
        dueYear.value = String(new Date().getFullYear());
    }
    dueMonth.value = String(date.getMonth() + 1);
    refreshDueDays();
    dueDay.value = String(date.getDate());
    dueHour.value = String(date.getHours());
    dueMinute.value = String(date.getMinutes());
    updateDateDisplay();
    updateTimeWheelDisplay();
}

function getDueWheelMs() {
    if (!dueYear || !dueMonth || !dueDay || !dueHour || !dueMinute) {
        return null;
    }
    var year = Number(dueYear.value);
    var month = Number(dueMonth.value);
    var day = Number(dueDay.value);
    var hour = Number(dueHour.value);
    var minute = Number(dueMinute.value);
    var date = new Date(year, month - 1, day, hour, minute, 0, 0);
    var ms = date.getTime();
    return Number.isFinite(ms) ? ms : null;
}

/* 日历选择器相关函数 */
function openCalendarModal() {
    if (!calendarModal || !dueYear || !dueMonth || !dueDay) {
        return;
    }

    // 确保有初始值
    if (!dueYear.value) {
        dueYear.value = String(new Date().getFullYear());
    }
    if (!dueMonth.value) {
        dueMonth.value = String(new Date().getMonth() + 1);
    }
    if (!dueDay.value) {
        refreshDueDays();
        dueDay.value = String(new Date().getDate());
    }

    calendarState.year = Number(dueYear.value);
    calendarState.month = Number(dueMonth.value);
    renderCalendar();
    calendarModal.classList.add("open");
    calendarModal.setAttribute("aria-hidden", "false");
}

function closeCalendarModal() {
    if (!calendarModal) return;
    calendarModal.classList.remove("open");
    calendarModal.setAttribute("aria-hidden", "true");
}

function renderCalendar() {
    if (!calendarTitle || !calendarDates) return;

    calendarTitle.textContent = calendarState.year + "年" + calendarState.month + "月";
    calendarDates.innerHTML = "";

    var year = calendarState.year;
    var month = calendarState.month;
    var firstDay = new Date(year, month - 1, 1).getDay();
    var maxDay = new Date(year, month, 0).getDate();
    var prevMonthMaxDay = new Date(year, month - 1, 0).getDate();

    var selectedDay = Number(dueDay.value) || 0;
    var today = new Date();
    var isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;
    var todayDate = today.getDate();

    // 上个月的日期
    for (var i = firstDay - 1; i >= 0; i--) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = String(prevMonthMaxDay - i);
        btn.className = "calendar-date other-month";
        calendarDates.appendChild(btn);
    }

    // 当月的日期
    for (var day = 1; day <= maxDay; day++) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = String(day);
        btn.className = "calendar-date";

        if (isCurrentMonth && day === todayDate) {
            btn.classList.add("today");
        }
        if (day === selectedDay) {
            btn.classList.add("selected");
        }

        btn.addEventListener("click", (function (d) {
            return function () {
                dueYear.value = String(calendarState.year);
                dueMonth.value = String(calendarState.month);
                dueDay.value = String(d);
                updateDateDisplay();
                closeCalendarModal();
            };
        })(day));

        calendarDates.appendChild(btn);
    }

    // 下个月的日期
    var totalCells = calendarDates.children.length;
    var remainingCells = 42 - totalCells;
    for (var day = 1; day <= remainingCells; day++) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = String(day);
        btn.className = "calendar-date other-month";
        calendarDates.appendChild(btn);
    }
}

function saveTaskNameFromSheet() {
    if (!state.currentMoreTaskId || !renameTaskInput) {
        return;
    }

    var nextName = renameTaskInput.value.trim();
    if (!nextName) {
        showToast("名称不能为空");
        return;
    }

    var task = findTask(state.currentMoreTaskId);
    if (!task) {
        return;
    }

    if (nextName === task.text) {
        showToast("名称未变化");
        return;
    }

    updateTask(state.currentMoreTaskId, { text: nextName });
    state.currentMoreTaskId = task.id;
    syncMoreSheetState();
    showToast("任务名称已更新");
}

if (renameTaskInput) {
    renameTaskInput.addEventListener("blur", function () {
        if (!state.currentMoreTaskId) {
            return;
        }
        var task = findTask(state.currentMoreTaskId);
        if (!task) {
            return;
        }
        var nextName = renameTaskInput.value.trim();
        if (nextName && nextName !== task.text) {
            updateTask(state.currentMoreTaskId, { text: nextName });
            syncMoreSheetState();
            showToast("任务名称已更新");
        }
    });
}

function openComposer() {
    composer.classList.add("open");
    composer.setAttribute("aria-hidden", "false");
    setTimeout(function () {
        newTaskInput.focus();
    }, 30);
}

function closeComposer() {
    composer.classList.remove("open");
    composer.setAttribute("aria-hidden", "true");
    newTaskInput.blur();
}

function commitComposerInput() {
    var value = newTaskInput.value.trim();
    if (value) {
        addTask(value);
    }
    newTaskInput.value = "";
    closeComposer();
}

function renderTag(tagElement, tagValue) {
    tagElement.className = "task-tag";
    if (tagValue && tagValue !== "none") {
        tagElement.classList.add("visible", tagValue);
    }
}

function buildMetaText(task) {
    var parts = [];
    if (task.group && GROUP_LABELS[task.group]) {
        parts.push(GROUP_LABELS[task.group]);
    }
    if (task.dueAt) {
        parts.push(formatDueText(task.dueAt));
    }
    return parts.join(" · ");
}

function setButtonGroupActive(container, attr, activeValue) {
    var selector = "button[data-" + attr + "]";
    var buttons = container.querySelectorAll(selector);
    buttons.forEach(function (button) {
        if (button.dataset[attr] === activeValue) {
            button.setAttribute("data-active", "true");
        } else {
            button.removeAttribute("data-active");
        }
    });
}

function requestNotificationPermissionIfNeeded() {
    if (!("Notification" in window)) {
        return;
    }
    if (Notification.permission === "default") {
        Notification.requestPermission();
    }
}

function scheduleAllReminders() {
    Object.keys(reminderTimers).forEach(function (id) {
        clearTimeout(reminderTimers[id]);
    });
    reminderTimers = {};

    state.tasks.forEach(function (task) {
        if (!task.dueAt || task.completed) {
            return;
        }

        var delay = task.dueAt - Date.now();
        if (delay <= 0) {
            if (!task.notifiedAt || task.notifiedAt < task.dueAt) {
                triggerReminder(task.id);
            }
            return;
        }

        if (delay > 2147483647) {
            delay = 2147483647;
        }

        reminderTimers[task.id] = setTimeout(function () {
            triggerReminder(task.id);
        }, delay);
    });
}

function triggerReminder(taskId) {
    var task = findTask(taskId);
    if (!task || task.completed || !task.dueAt) {
        return;
    }
    if (task.notifiedAt && task.notifiedAt >= task.dueAt) {
        return;
    }

    var title = "任务提醒";
    var body = task.text;

    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body: body });
    } else {
        showToast(title + "：" + body);
    }

    task.notifiedAt = Date.now();
    persistOnly();
}

function showToast(message) {
    if (toastText) {
        toastText.textContent = message;
    } else {
        toast.textContent = message;
    }
    toast.classList.remove("with-action");
    toast.classList.add("show");
    if (toastTimer) {
        clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(function () {
        toast.classList.remove("show");
    }, 1800);
}

function showUndoToast(message) {
    if (toastText) {
        toastText.textContent = message;
    } else {
        toast.textContent = message;
    }

    toast.classList.add("with-action");
    toast.classList.add("show");

    if (toastTimer) {
        clearTimeout(toastTimer);
    }

    toastTimer = setTimeout(function () {
        toast.classList.remove("show");
        toast.classList.remove("with-action");
        clearPendingUndoDelete();
    }, 4200);
}

function queueUndoDelete(taskSnapshot, taskIndex) {
    pendingUndoDelete = {
        task: taskSnapshot,
        index: taskIndex
    };

    if (undoTimer) {
        clearTimeout(undoTimer);
    }

    showUndoToast("删除了“" + taskSnapshot.text + "”");

    undoTimer = setTimeout(function () {
        clearPendingUndoDelete();
    }, 4300);
}

function restoreDeletedTask() {
    if (!pendingUndoDelete) {
        return;
    }

    var restoredTask = pendingUndoDelete.task;
    var index = pendingUndoDelete.index;

    if (getTaskIndex(restoredTask.id) >= 0) {
        clearPendingUndoDelete();
        return;
    }

    var safeIndex = Math.max(0, Math.min(index, state.tasks.length));
    state.tasks.splice(safeIndex, 0, restoredTask);
    persistAndRender();

    toast.classList.remove("with-action");
    showToast("已撤销删除");
    clearPendingUndoDelete();
}

function clearPendingUndoDelete() {
    pendingUndoDelete = null;
    if (undoTimer) {
        clearTimeout(undoTimer);
        undoTimer = null;
    }
}

function nextOrder() {
    var max = 0;
    state.tasks.forEach(function (task) {
        if (task.order > max) {
            max = task.order;
        }
    });
    return max + 1;
}

function findTask(taskId) {
    for (var i = 0; i < state.tasks.length; i++) {
        if (state.tasks[i].id === taskId) {
            return state.tasks[i];
        }
    }
    return null;
}

function getTaskIndex(taskId) {
    for (var i = 0; i < state.tasks.length; i++) {
        if (state.tasks[i].id === taskId) {
            return i;
        }
    }
    return -1;
}

function findTaskElement(taskId) {
    return taskList.querySelector('.task-item[data-id="' + taskId + '"]');
}

function closeOpenedActions(exceptTaskId) {
    var openedItems = taskList.querySelectorAll(".task-item.show-actions");
    openedItems.forEach(function (openedItem) {
        if (exceptTaskId && openedItem.dataset.id === exceptTaskId) {
            return;
        }
        var card = openedItem.querySelector(".task-card");
        if (card) {
            card.style.transition = "transform 0.22s cubic-bezier(0.22, 0.61, 0.36, 1)";
            card.style.transform = "translateX(0px)";
        }
        openedItem.classList.remove("show-actions");
    });
}

function persistAndRender() {
    persistOnly();
    render();
    scheduleAllReminders();
}

function persistOnly() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
}

function loadTasks() {
    try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return [];
        }
        var parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function normalizeTasks(tasks) {
    return tasks.map(function (task, index) {
        return {
            id: typeof task.id === "string" ? task.id : uid(),
            text: typeof task.text === "string" ? task.text : "",
            completed: Boolean(task.completed),
            tag: normalizeTag(task.tag),
            group: normalizeGroup(task.group),
            pinned: Boolean(task.pinned),
            dueAt: typeof task.dueAt === "number" ? task.dueAt : null,
            notifiedAt: typeof task.notifiedAt === "number" ? task.notifiedAt : null,
            createdAt: typeof task.createdAt === "number" ? task.createdAt : Date.now(),
            order: typeof task.order === "number" ? task.order : index + 1
        };
    }).filter(function (task) {
        return task.text.trim().length > 0;
    });
}

function normalizeTag(value) {
    if (value === "red" || value === "orange" || value === "green" || value === "blue") {
        return value;
    }
    return "none";
}

function normalizeGroup(value) {
    if (value === "study" || value === "entertainment" || value === "withme") {
        return value;
    }
    if (value === "today") {
        return "study";
    }
    if (value === "work") {
        return "entertainment";
    }
    if (value === "life") {
        return "withme";
    }
    return "none";
}

function formatDueText(ms) {
    var date = new Date(ms);
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    var hour = String(date.getHours()).padStart(2, "0");
    var minute = String(date.getMinutes()).padStart(2, "0");
    return month + "/" + day + " " + hour + ":" + minute;
}

function msToDatetimeLocal(ms) {
    var date = new Date(ms);
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    var hour = String(date.getHours()).padStart(2, "0");
    var minute = String(date.getMinutes()).padStart(2, "0");
    return year + "-" + month + "-" + day + "T" + hour + ":" + minute;
}

function localDateTimeToMs(value) {
    var date = new Date(value);
    var ms = date.getTime();
    return Number.isFinite(ms) ? ms : null;
}

function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function applySwipeResistance(dx) {
    if (dx >= 0) {
        if (dx <= 96) {
            return dx;
        }
        return clamp(96 + (dx - 96) * 0.42, 0, 190);
    }

    var abs = Math.abs(dx);
    if (abs <= 120) {
        return dx;
    }

    var resisted = -(120 + (abs - 120) * 0.52);
    return clamp(resisted, -260, 0);
}

function isInteractiveTarget(target) {
    return Boolean(target.closest("input, button, .sheet-panel, .task-card"));
}
