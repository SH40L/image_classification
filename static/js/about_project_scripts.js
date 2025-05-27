document.addEventListener('DOMContentLoaded', () => {
    const options = document.querySelectorAll('.option');
    const sections = document.querySelectorAll('.content-section');
    const optionsContainer = document.querySelector('.options-container');
    let firstClick = true;

    options.forEach(option => {
        option.addEventListener('click', () => {
            // Remove active class from all options and sections
            options.forEach(opt => opt.classList.remove('active'));
            sections.forEach(sec => sec.classList.remove('active', 'fade-in', 'slide-in', 'zoom-in', 'flip-in'));

            // Add active class to clicked option and corresponding section
            option.classList.add('active');
            const targetSection = document.getElementById(option.getAttribute('data-target'));

            // Add specific transition class based on the clicked option
            switch (option.getAttribute('data-target')) {
                case 'overview':
                    targetSection.classList.add('slide-in');
                    break;
                case 'features':
                    targetSection.classList.add('slide-in');
                    break;
                case 'technologies':
                    targetSection.classList.add('slide-in');
                    break;
                case 'how-it-works':
                    targetSection.classList.add('slide-in');
                    break;
                default:
                    targetSection.classList.add('slide-in');
            }

            targetSection.classList.add('active');

            // Scroll to options container only on the first click
            if (firstClick) {
                smoothScrollTo(optionsContainer, 1000); // Duration in milliseconds (1000ms = 1 second)
                firstClick = false;
            }
        });
    });

    function smoothScrollTo(element, duration) {
        let targetPosition = element.getBoundingClientRect().top + window.pageYOffset;
        let startPosition = window.pageYOffset;
        let startTime = null;

        function animation(currentTime) {
            if (startTime === null) startTime = currentTime;
            let timeElapsed = currentTime - startTime;
            let run = ease(timeElapsed, startPosition, targetPosition - startPosition, duration);
            window.scrollTo(0, run);
            if (timeElapsed < duration) requestAnimationFrame(animation);
        }

        function ease(t, b, c, d) {
            t /= d / 2;
            if (t < 1) return c / 2 * t * t + b;
            t--;
            return -c / 2 * (t * (t - 2) - 1) + b;
        }

        requestAnimationFrame(animation);
    }
});
