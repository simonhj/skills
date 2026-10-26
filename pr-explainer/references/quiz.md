# Quiz template

Drop this into the explainer page as the final section. Everything is rendered
by JavaScript at load time; nothing about the quiz is static HTML except the
container. Each question's answer order is shuffled with Fisher–Yates on every
page load, so two reads of the page present the choices differently.

## Markup

Place at the end of `<main>`, and give it a TOC entry:

```html
<section id="quiz">
  <h2 id="quiz-heading">Check your understanding</h2>
  <p>One correct answer per question. Choices are shuffled on every load.</p>
  <div id="quiz-root"></div>
  <p id="quiz-score" hidden></p>
</section>
```

## CSS

Inherits the page's typography; only quiz-specific rules here:

```css
.quiz-q { margin: 2.5rem 0; }
.quiz-prompt { font-weight: 600; margin-bottom: 0.6rem; }
.quiz-choice {
  display: block; width: 100%; text-align: left;
  margin: 0.4rem 0; padding: 0.6rem 0.9rem;
  font: inherit; background: none; cursor: pointer;
  border: 1px solid #ccc; border-radius: 4px;
}
.quiz-choice:hover:not(:disabled) { background: #f5f5f0; }
.quiz-choice:disabled { cursor: default; }
.quiz-choice.is-correct { border-color: #2e7d32; background: #e8f5e9; }
.quiz-choice.is-wrong { border-color: #c62828; background: #fdecea; }
.quiz-explain { font-size: 0.9em; color: #555; margin: 0.6rem 0 0; }
#quiz-score { font-weight: 600; margin-top: 2rem; }
```

## JavaScript

Fill `QUESTIONS` with the PR-specific questions. `correct` is the index into
`choices` **before** shuffling. `explain` may contain inline HTML (`<code>`,
links); `prompt` and `choices` are plain text. `anchor` points at the section
of the explainer that answers the question.

```html
<script>
(function () {
  var QUESTIONS = [
    {
      prompt: "Why does retryFetch re-read the auth token before each attempt?",
      choices: [
        "So a token rotated during backoff is picked up on the next attempt",
        "To keep the HTTP client stateless between calls",
        "Because this PR removed the token cache entirely",
        "To avoid a race with the config file watcher"
      ],
      correct: 0,
      explain: "The backoff can last longer than the token TTL, so <code>retryFetch</code> re-reads it per attempt.",
      anchor: "#retry-loop"
    }
    // ... one object per question
  ];

  function shuffledIndices(n) {
    var idx = [];
    for (var i = 0; i < n; i++) idx.push(i);
    for (var i = n - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = idx[i]; idx[i] = idx[j]; idx[j] = t;
    }
    return idx;
  }

  var answered = 0, score = 0;
  var root = document.getElementById("quiz-root");

  QUESTIONS.forEach(function (q, qi) {
    var box = document.createElement("div");
    box.className = "quiz-q";

    var p = document.createElement("p");
    p.className = "quiz-prompt";
    p.textContent = (qi + 1) + ". " + q.prompt;
    box.appendChild(p);

    var order = shuffledIndices(q.choices.length); // fresh per page load
    var buttons = [];

    order.forEach(function (ci) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "quiz-choice";
      btn.textContent = q.choices[ci];
      btn.addEventListener("click", function () {
        buttons.forEach(function (b) { b.disabled = true; });
        var right = ci === q.correct;
        btn.classList.add(right ? "is-correct" : "is-wrong");
        if (!right) buttons[order.indexOf(q.correct)].classList.add("is-correct");

        var note = document.createElement("p");
        note.className = "quiz-explain";
        note.innerHTML = (right ? "Correct. " : "Not quite. ") + q.explain +
          (q.anchor ? ' <a href="' + q.anchor + '">Jump to section</a>' : "");
        box.appendChild(note);

        if (right) score++;
        answered++;
        if (answered === QUESTIONS.length) {
          var s = document.getElementById("quiz-score");
          s.hidden = false;
          s.textContent = "Score: " + score + " / " + QUESTIONS.length +
            (score === QUESTIONS.length
              ? " — you understood the PR."
              : " — revisit the linked sections above.");
        }
      });
      buttons.push(btn);
      box.appendChild(btn);
    });

    root.appendChild(box);
  });
})();
</script>
```

Behavior guaranteed by the template:

- Choices render in a different order on each load (Fisher–Yates over index
  array; `order[k]` maps display position `k` back to the original choice).
- First click on a question disables all its buttons, marks the clicked button
  right or wrong, and always reveals the correct one.
- The explanation with its section link appears under the question.
- The score line appears only after every question is answered.
