// ============================================
// 1. 获取 HTML 元素
// ============================================
var mainInput = document.getElementById('mainInput');
var todoList = document.getElementById('todoList');
var canvas = document.getElementById('particleCanvas');
var ctx = canvas.getContext('2d');
var totalCountEl = document.getElementById('totalCount');
var doneCountEl = document.getElementById('doneCount');

// ============================================
// 2. 定义全局变量
// ============================================
var isInputActive = false;
var selectedIndex = -1;
var selectedGroup = null;
var particles = [];
var isEditingDesc = false;
var currentDescInput = null;
var isEditingTask = false;
var currentTaskInput = null;
var draggedElement = null;
var dragOffset = 0;

// ============================================
// 3. 核心按键逻辑
// ============================================
document.addEventListener('keydown', function (event) {
    if (isEditingTask && currentTaskInput) {
        if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
            event.preventDefault();
            saveTask(currentTaskInput);
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            cancelEditTask(currentTaskInput);
            return;
        }
        if (event.key === 'Tab' || (event.key !== 'Shift' && event.key !== 'Control' && event.key !== 'Alt' && event.key !== 'Meta')) {
            if (event.key !== 'Shift' && event.key !== 'Control' && event.key !== 'Alt' && event.key !== 'Meta') {
                saveTask(currentTaskInput);
            }
        }
        return;
    }

    if (isEditingDesc && currentDescInput) {
        // 方向键 - 退出描述编辑，回到任务高光
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
            event.preventDefault();
            saveDescription(currentDescInput);

            var liElement = currentDescInput.previousElementSibling;
            var group = liElement.closest('.task-group');
            var allGroups = getAllGroupsInVisualOrder();

            if (event.key === 'ArrowUp') {
                var currentIndex = allGroups.indexOf(group);
                if (currentIndex > 0) {
                    selectedGroup = allGroups[currentIndex - 1];
                } else {
                    selectedGroup = null;
                }
            } else if (event.key === 'ArrowDown') {
                var currentIndex = allGroups.indexOf(group);
                if (currentIndex < allGroups.length - 1) {
                    selectedGroup = allGroups[currentIndex + 1];
                } else {
                    selectedGroup = null;
                }
            } else if (event.key === 'ArrowLeft') {
                selectedGroup = group;
            }

            isEditingDesc = false;
            refreshView();
            return;
        }

        if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
            event.preventDefault();
            saveDescription(currentDescInput);
            return;
        }
        if ((event.ctrlKey || event.metaKey || event.shiftKey) && event.key === 'Enter') {
            event.preventDefault();
            var start = currentDescInput.selectionStart;
            var end = currentDescInput.selectionEnd;
            var value = currentDescInput.value;
            currentDescInput.value = value.substring(0, start) + '\n' + value.substring(end);
            currentDescInput.selectionStart = currentDescInput.selectionEnd = start + 1;
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            cancelEditDesc(currentDescInput);
            return;
        }
        return;
    }

    if (event.key === 'Tab') {
        event.preventDefault();
        isInputActive = !isInputActive;
        if (isInputActive) {
            mainInput.classList.add('active');
            mainInput.focus();
            selectedGroup = null;
        } else {
            mainInput.classList.remove('active');
            mainInput.blur();
            mainInput.value = '';
        }
        refreshView();
        return;
    }

    if (event.key === 'Enter' && isInputActive) {
        event.preventDefault();
        var text = mainInput.value.trim();
        if (text.length > 0) {
            addTask(text);
            mainInput.value = '';
            isInputActive = false;
            mainInput.classList.remove('active');
            refreshView();
            saveData();
        }
        return;
    }

    if (!isInputActive) {
        var allGroups = getAllGroupsInVisualOrder();

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (allGroups.length > 0) {
                if (selectedGroup === null) {
                    selectedGroup = allGroups[allGroups.length - 1];
                } else {
                    var currentIndex = allGroups.indexOf(selectedGroup);
                    if (currentIndex > 0) {
                        selectedGroup = allGroups[currentIndex - 1];
                    } else {
                        selectedGroup = null;
                    }
                }
            }
            isEditingDesc = false;
            refreshView();
            return;
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (allGroups.length > 0) {
                if (selectedGroup === null) {
                    selectedGroup = allGroups[0];
                } else {
                    var currentIndex = allGroups.indexOf(selectedGroup);
                    if (currentIndex < allGroups.length - 1) {
                        selectedGroup = allGroups[currentIndex + 1];
                    } else {
                        selectedGroup = null;
                    }
                }
            }
            isEditingDesc = false;
            refreshView();
            return;
        }

        if ((event.key === 't' || event.key === 'T' || event.key === 'ArrowRight') && selectedGroup !== null) {
            event.preventDefault();
            if (!selectedGroup.classList.contains('completed')) {
                isEditingDesc = true;
                var li = selectedGroup.querySelector('li');
                editDescription(li);
            }
            return;
        }

        if ((event.key === 'e' || event.key === 'E') && selectedGroup !== null) {
            event.preventDefault();
            if (!selectedGroup.classList.contains('completed')) {
                isEditingTask = true;
                var li = selectedGroup.querySelector('li');
                editTask(li);
            }
            return;
        }

        if ((event.code === 'Space' || (event.key === 'Enter' && !event.ctrlKey && !event.metaKey)) && selectedGroup !== null) {
            event.preventDefault();

            if (selectedGroup.classList.contains('completed')) {
                // 已完成 -> 变未完成，找到最后一个未完成任务的位置
                selectedGroup.classList.remove('completed');
                var lastUncompletedGroup = todoList.querySelector('.task-group:not(.completed):last-of-type');
                if (lastUncompletedGroup) {
                    lastUncompletedGroup.parentNode.insertBefore(selectedGroup, lastUncompletedGroup.nextSibling);
                } else {
                    todoList.insertBefore(selectedGroup, todoList.firstChild);
                }
            } else {
                // 未完成 -> 变已完成
                selectedGroup.classList.add('completed');
            }

            saveData();
            refreshView();
            updateStats();
            return;
        }

        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            var completedGroups = todoList.querySelectorAll('.task-group.completed');
            if (completedGroups.length > 0) {
                for (var i = completedGroups.length - 1; i >= 0; i--) {
                    completedGroups[i].remove();
                }
                selectedGroup = null;
                refreshView();
                saveData();
                updateStats();
            }
            return;
        }
    }
});

// ============================================
// 4. 获取所有任务列表（按显示顺序）
// ============================================
function getAllItems() {
    var groups = todoList.querySelectorAll('.task-group');
    var items = [];
    for (var i = 0; i < groups.length; i++) {
        items.push(groups[i].querySelector('li'));
    }
    return items;
}

// ============================================
// 4.5 获取所有未完成的任务列表
// ============================================
function getAllUncompletedItems() {
    var groups = todoList.querySelectorAll('.task-group:not(.completed)');
    var items = [];
    for (var i = 0; i < groups.length; i++) {
        items.push(groups[i].querySelector('li'));
    }
    return items;
}

// ============================================
// 4.6 获取按视觉显示顺序的任务组(未完成在前)
// ============================================
function getAllGroupsInVisualOrder() {
    var uncompleted = Array.from(todoList.querySelectorAll('.task-group:not(.completed)'));
    var completed = Array.from(todoList.querySelectorAll('.task-group.completed'));
    return uncompleted.concat(completed);
}

// ============================================
// 5. 添加任务函数 - 新任务显示在最上方
// ============================================
function addTask(text) {
    var group = document.createElement('div');
    group.classList.add('task-group');

    var li = document.createElement('li');
    li.textContent = text;
    li.addEventListener('click', function (e) {
        e.stopPropagation();
        handleTaskClick(li);
    });
    li.addEventListener('dblclick', function (e) {
        e.stopPropagation();
        isEditingTask = true;
        editTask(li);
    });

    group.appendChild(li);

    // 添加拖拽事件
    setupDragEvents(group);

    // 新任务插入到顶部
    var firstGroup = todoList.querySelector('.task-group:not(.completed)');
    if (firstGroup) {
        todoList.insertBefore(group, firstGroup);
    } else {
        todoList.insertBefore(group, todoList.firstChild);
    }
}

// ============================================
// 6. 设置拖拽事件
// ============================================
function setupDragEvents(group) {
    var startY = 0;
    var long_press_timer = null;
    var isDragging = false;
    var isMouseDown = false;
    var clickTarget = null;

    group.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        clickTarget = e.target;
        startY = e.clientY;
        isDragging = false;
        isMouseDown = true;

        long_press_timer = setTimeout(function () {
            if (isMouseDown) {
                isDragging = true;
                draggedElement = group;
                group.classList.add('dragging');
            }
        }, 300);
    });

    document.addEventListener('mousemove', function (e) {
        if (isDragging && draggedElement === group) {
            var moveY = e.clientY - startY;
            var groups = Array.from(todoList.querySelectorAll('.task-group:not(.completed)'));
            var currentIndex = groups.indexOf(draggedElement);

            if (moveY < -60 && currentIndex > 0) {
                var prevGroup = groups[currentIndex - 1];
                todoList.insertBefore(draggedElement, prevGroup);
                saveData();
                startY = e.clientY;
            } else if (moveY > 60 && currentIndex < groups.length - 1) {
                var nextGroup = groups[currentIndex + 1];
                todoList.insertBefore(nextGroup, draggedElement);
                saveData();
                startY = e.clientY;
            }
        }
    });

    document.addEventListener('mouseup', function () {
        clearTimeout(long_press_timer);

        if (isDragging && draggedElement === group) {
            group.classList.remove('dragging');
            draggedElement = null;
            isDragging = false;
        } else if (!isDragging && isMouseDown) {
            // 普通点击：只有点击 li 或 task-desc 才处理
            if (clickTarget === group.querySelector('li') || clickTarget.closest('.task-desc')) {
                var li = group.querySelector('li');
                handleTaskClick(li);
            }
        }

        isMouseDown = false;
        clickTarget = null;
    });
}

// ============================================
// 7. 处理任务点击事件
// ============================================
function handleTaskClick(liElement) {
    var group = liElement.closest('.task-group');
    selectedGroup = group;
    refreshView();
}

// ============================================
// 8. 编辑任务标题
// ============================================
function editTask(liElement) {
    // 已完成的任务不能编辑
    var group = liElement.closest('.task-group');
    if (group.classList.contains('completed')) {
        return;
    }

    // 已在编辑当前任务时，直接聚焦现有输入框，避免重复创建导致内容丢失
    var existingInput = liElement.querySelector('input.task-edit-input');
    if (existingInput) {
        isEditingTask = true;
        currentTaskInput = existingInput;
        existingInput.focus();
        return;
    }

    var originalText = liElement.textContent;
    liElement.dataset.originalText = originalText;

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'task-edit-input';
    input.style.cssText = 'background: rgba(255, 255, 255, 0.1); border: none; border-bottom: 1px solid #555; color: #fff; font-size: 2.2rem; width: 100%; outline: none; padding: 0; font-weight: 600;';
    input.value = originalText;

    liElement.textContent = '';
    liElement.appendChild(input);

    currentTaskInput = input;
    input.focus();

    // 输入框内双击不再冒泡到 li，避免重复触发编辑逻辑
    input.addEventListener('dblclick', function (e) {
        e.stopPropagation();
    });

    input.addEventListener('blur', function () {
        setTimeout(() => {
            if (document.activeElement !== input) {
                saveTask(input);
            }
        }, 100);
    });
}

// ============================================
// 9. 保存任务标题
// ============================================
function saveTask(inputElement) {
    if (!inputElement || !inputElement.parentNode) {
        return;
    }

    var newText = inputElement.value.trim();
    var liElement = inputElement.parentNode;
    var group = liElement.closest('.task-group');

    isEditingTask = false;
    currentTaskInput = null;

    if (newText.length > 0) {
        liElement.textContent = newText;
        liElement.dataset.originalText = newText;
        liElement.addEventListener('click', function (e) {
            e.stopPropagation();
            handleTaskClick(liElement);
        });
        liElement.addEventListener('dblclick', function (e) {
            e.stopPropagation();
            isEditingTask = true;
            editTask(liElement);
        });
        saveData();
    } else {
        // 空任务：删除该任务组
        group.remove();
        if (selectedGroup === group) {
            selectedGroup = null;
        }
        saveData();
        updateStats();
    }

    refreshView();
}

// ============================================
// 10. 取消编辑任务
// ============================================
function cancelEditTask(inputElement) {
    if (!inputElement || !inputElement.parentNode) {
        return;
    }

    var liElement = inputElement.parentNode;
    var originalText = liElement.dataset.originalText || '';

    liElement.textContent = originalText;
    liElement.addEventListener('click', function (e) {
        e.stopPropagation();
        handleTaskClick(liElement);
    });
    liElement.addEventListener('dblclick', function (e) {
        e.stopPropagation();
        isEditingTask = true;
        editTask(liElement);
    });

    isEditingTask = false;
    currentTaskInput = null;
    refreshView();
}

// ============================================
// 11. 编辑任务描述
// ============================================
function editDescription(liElement) {
    var group = liElement.closest('.task-group');
    var existingDesc = group.querySelector('.task-desc');
    var descText = '';

    if (existingDesc) {
        descText = existingDesc.textContent;
        existingDesc.remove();
    }

    var input = document.createElement('textarea');
    input.style.cssText = 'background: rgba(255, 255, 255, 0.1); border: none; border-bottom: 1px solid #555; color: #aaa; font-size: 1.3rem; width: 100%; outline: none; padding: 0 0 0 24px; margin-top: 4px; font-family: inherit; resize: none; height: 80px; line-height: 1.5;';
    input.placeholder = '添加描述...';
    input.value = descText;

    group.appendChild(input);
    currentDescInput = input;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    input.addEventListener('blur', function () {
        setTimeout(() => {
            if (document.activeElement !== input) {
                saveDescription(input);
            }
        }, 100);
    });
}

// ============================================
// 12. 保存描述
// ============================================
function saveDescription(inputElement) {
    var descText = inputElement.value.trim();
    var group = inputElement.closest('.task-group');

    inputElement.remove();
    isEditingDesc = false;
    currentDescInput = null;

    var li = group.querySelector('li');
    if (descText.length > 0) {
        var desc = document.createElement('div');
        desc.classList.add('task-desc');
        desc.textContent = descText;
        desc.addEventListener('click', function (e) {
            e.stopPropagation();
            handleTaskClick(li);
        });
        group.appendChild(desc);

        li.dataset.description = descText;
        saveData();
    } else {
        saveData();
    }

    refreshView();
}

// ============================================
// 13. 取消编辑描述
// ============================================
function cancelEditDesc(inputElement) {
    var group = inputElement.closest('.task-group');
    var li = group.querySelector('li');
    var descText = li.dataset.description || '';

    inputElement.remove();
    isEditingDesc = false;
    currentDescInput = null;

    if (descText.length > 0) {
        var desc = document.createElement('div');
        desc.classList.add('task-desc');
        desc.textContent = descText;
        desc.addEventListener('click', function (e) {
            e.stopPropagation();
            handleTaskClick(li);
        });
        group.appendChild(desc);
    }

    refreshView();
}

// ============================================
// 14. 更新视图：高亮显示当前选中任务
// ============================================
function refreshView() {
    var allGroups = Array.from(todoList.querySelectorAll('.task-group'));
    for (var i = 0; i < allGroups.length; i++) {
        if (selectedGroup && allGroups[i] === selectedGroup) {
            allGroups[i].classList.add('focused');
        } else {
            allGroups[i].classList.remove('focused');
        }
    }
}

// ============================================
// 15. 更新统计信息
// ============================================
function updateStats() {
    var allGroups = todoList.querySelectorAll('.task-group');
    var completedCount = todoList.querySelectorAll('.task-group.completed').length;
    var totalCount = allGroups.length;

    totalCountEl.textContent = totalCount + ' 个任务';
    doneCountEl.textContent = completedCount + ' 已完成';
}

// ============================================
// 16. 保存数据到 LocalStorage
// ============================================
function saveData() {
    var data = [];
    var groups = todoList.querySelectorAll('.task-group');

    for (var i = 0; i < groups.length; i++) {
        var li = groups[i].querySelector('li');
        var desc = groups[i].querySelector('.task-desc');

        data.push({
            text: li.textContent,
            description: desc ? desc.textContent : '',
            done: groups[i].classList.contains('completed'),
            timestamp: li.dataset.timestamp || new Date().getTime()
        });
    }

    localStorage.setItem('blackhole_data', JSON.stringify(data));
}

// ============================================
// 17. 粒子动画引擎
// ============================================
function updateCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (var i = particles.length - 1; i >= 0; i--) {
        var p = particles[i];
        p.x += p.xv;
        p.y += p.yv;
        p.yv += 0.12;
        p.angle += p.rotation;
        p.life -= 0.012;

        if (p.life > 0) {
            ctx.save();
            ctx.globalAlpha = p.life * 0.7;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.angle);
            ctx.fillStyle = '#fff';
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            ctx.restore();
        } else {
            particles.splice(i, 1);
        }
    }

    requestAnimationFrame(updateCanvas);
}

// ============================================
// 18. 页面加载完成后的初始化
// ============================================
window.addEventListener('load', function () {
    var saved = JSON.parse(localStorage.getItem('blackhole_data') || '[]');

    for (var i = 0; i < saved.length; i++) {
        if (!saved[i].text || saved[i].text.trim().length === 0) {
            continue;
        }

        var group = document.createElement('div');
        group.classList.add('task-group');

        var li = document.createElement('li');
        li.textContent = saved[i].text;
        li.dataset.timestamp = saved[i].timestamp || new Date().getTime();
        li.dataset.description = saved[i].description || '';

        (function (liElement, grp) {
            liElement.addEventListener('click', function (e) {
                e.stopPropagation();
                handleTaskClick(liElement);
            });
            liElement.addEventListener('dblclick', function (e) {
                e.stopPropagation();
                if (!grp.classList.contains('completed')) {
                    isEditingTask = true;
                    editTask(liElement);
                }
            });
        })(li, group);

        if (saved[i].done) {
            group.classList.add('completed');
        }

        group.appendChild(li);

        if (saved[i].description) {
            var desc = document.createElement('div');
            desc.classList.add('task-desc');
            desc.textContent = saved[i].description;
            (function (liElement) {
                desc.addEventListener('click', function (e) {
                    e.stopPropagation();
                    handleTaskClick(liElement);
                });
                desc.addEventListener('dblclick', function (e) {
                    e.stopPropagation();
                    var grp = liElement.closest('.task-group');
                    if (!grp.classList.contains('completed')) {
                        isEditingDesc = true;
                        editDescription(liElement);
                    }
                });
            })(li);
            group.appendChild(desc);
        }

        setupDragEvents(group);
        todoList.appendChild(group);
    }

    cleanupOldTasks();
    updateStats();
    updateCanvas();
});

// ============================================
// 19. 自动清理7天前完成的任务
// ============================================
function cleanupOldTasks() {
    var now = new Date().getTime();
    var sevenDays = 7 * 24 * 60 * 60 * 1000;
    var groups = todoList.querySelectorAll('.task-group.completed');
    var toRemove = [];

    for (var i = 0; i < groups.length; i++) {
        var li = groups[i].querySelector('li');
        var timestamp = parseInt(li.dataset.timestamp) || now;
        if (now - timestamp > sevenDays) {
            toRemove.push(groups[i]);
        }
    }

    for (var j = 0; j < toRemove.length; j++) {
        toRemove[j].remove();
    }

    if (toRemove.length > 0) {
        saveData();
    }
}

// ============================================
// 20. 监听页面关闭时保存数据
// ============================================
window.addEventListener('beforeunload', function () {
    saveData();
});

// ============================================
// 21. 监听窗口大小变化
// ============================================
window.addEventListener('resize', function () {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});