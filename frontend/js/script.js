// =========================================
// YAAR AI DESIGN MENTOR
// Frontend JavaScript
// =========================================

const API_BASE_URL = "http://127.0.0.1:8001";


// =========================================
// ELEMENTS
// =========================================

const imageInput = document.getElementById("imageInput");
const dropZone = document.getElementById("dropZone");

const imagePreview = document.getElementById("imagePreview");
const previewContainer = document.getElementById("previewContainer");
const fileName = document.getElementById("fileName");

const analyzeButton = document.getElementById("analyzeButton");
const removeImageButton = document.getElementById("removeImageButton");

const loading = document.getElementById("loading");

const uploadView = document.getElementById("uploadView");
const resultsView = document.getElementById("resultsView");

const newReviewButton =
    document.getElementById("newReviewButton");

const resultNewReviewButton =
    document.getElementById("resultNewReviewButton");

const historyList =
    document.getElementById("historyList");


// =========================================
// RESULT ELEMENTS
// =========================================

const reviewId =
    document.getElementById("reviewId");

const reviewFilename =
    document.getElementById("reviewFilename");

const resultTitle =
    document.getElementById("resultTitle");

const accessibilityScore =
    document.getElementById("accessibilityScore");

const yoloCount =
    document.getElementById("yoloCount");

const ocrCount =
    document.getElementById("ocrCount");

const clipStatus =
    document.getElementById("clipStatus");

const yoloResults =
    document.getElementById("yoloResults");

const ocrResults =
    document.getElementById("ocrResults");

const clipResults =
    document.getElementById("clipResults");

const accessibilityResults =
    document.getElementById("accessibilityResults");

const recommendations =
    document.getElementById("recommendations");


// =========================================
// PDF BUTTON
// =========================================

const downloadPdfButton =
    document.getElementById("downloadPdfButton");


// =========================================
// CURRENT REVIEW DATA
// =========================================

let currentReviewData = null;

let currentImageFile = null;

let historyRequestVersion = 0;

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = [".png", ".jpg", ".jpeg"];
const SUPPORTED_TYPES = ["image/png", "image/jpeg"];


// =========================================
// IMAGE UPLOAD
// =========================================

imageInput.addEventListener("change", function () {

    const file = imageInput.files[0];

    if (file) {
        selectImage(file);
    }

});


// =========================================
// SELECT IMAGE
// =========================================

function selectImage(file) {

    const extension =
        file.name.slice(file.name.lastIndexOf(".")).toLowerCase();

    if (
        !SUPPORTED_EXTENSIONS.includes(extension) ||
        !SUPPORTED_TYPES.includes(file.type) ||
        file.size > MAX_FILE_SIZE
    ) {

        alert("Please select a PNG, JPG, or JPEG image smaller than 10 MB.");

        imageInput.value = "";

        return;
    }

    currentImageFile = file;

    fileName.textContent = file.name;

    imagePreview.src = URL.createObjectURL(file);

    previewContainer.style.display = "block";

    analyzeButton.disabled = false;
}


// =========================================
// DRAG AND DROP
// =========================================

dropZone.addEventListener("dragover", function (event) {

    event.preventDefault();

    dropZone.classList.add("dragging");

});


dropZone.addEventListener("dragleave", function () {

    dropZone.classList.remove("dragging");

});


dropZone.addEventListener("drop", function (event) {

    event.preventDefault();

    dropZone.classList.remove("dragging");

    const file = event.dataTransfer.files[0];

    if (!file) {
        return;
    }

    if (
        !SUPPORTED_TYPES.includes(file.type) ||
        file.size > MAX_FILE_SIZE
    ) {

        alert("Please select a PNG, JPG, or JPEG image smaller than 10 MB.");

        return;
    }

    imageInput.files = event.dataTransfer.files;

    selectImage(file);

});


// =========================================
// REMOVE IMAGE
// =========================================

removeImageButton.addEventListener(
    "click",
    resetUpload
);


function resetUpload() {

    imageInput.value = "";

    imagePreview.src = "";

    fileName.textContent = "-";

    previewContainer.style.display = "none";

    analyzeButton.disabled = true;

    currentImageFile = null;

}


// =========================================
// ANALYZE IMAGE
// =========================================

analyzeButton.addEventListener(
    "click",
    analyzeImage
);


async function analyzeImage() {

    const file = imageInput.files[0];

    if (!file) {

        alert("Please select an image first.");

        return;
    }

    loading.style.display = "block";

    analyzeButton.disabled = true;

    const controller = new AbortController();

    const timeoutId = setTimeout(function () {
        controller.abort();
    }, 120000);

    try {

        const formData = new FormData();

        formData.append("file", file);

        const response = await fetch(
            `${API_BASE_URL}/review`,
            {
                method: "POST",
                body: formData,
                signal: controller.signal
            }
        );

        if (!response.ok) {
            const errorData = await response.json().catch(function () {
                return {};
            });

            const detail = errorData.detail || {};
            const error = new Error(
                detail.message || "We couldn't complete the design analysis. Please try again."
            );

            error.code = detail.code || "server_error";
            throw error;
        }

        const data = await response.json();

        console.log(
            "YAAR Review Response:",
            data
        );

        /*
         * Save the complete review response.
         * This is used by the PDF generator.
         */
        currentReviewData = data;

        currentImageFile = file;

        showResultsView();

        /*
         * IMPORTANT:
         * Show the results screen immediately after the backend
         * returns successfully. Do not wait for PostgreSQL history.
         */
        displayResults(data);

        /*
         * Refresh PostgreSQL history in the background.
         * A slow history request must never block the new review.
         */
        loadHistory().catch(function (historyError) {

            console.error(
                "History refresh failed:",
                historyError
            );

        });

    } catch (error) {

        console.error(
            "Analysis failed:",
            error
        );

        showAnalysisError(error);

    } finally {

        clearTimeout(timeoutId);

        loading.style.display = "none";

        analyzeButton.disabled = false;

    }

}


function showAnalysisError(error) {

    const messages = {
        invalid_image: "Please upload a PNG, JPG, or JPEG image.",
        file_too_large: "Please upload an image smaller than 10 MB.",
        database_error: "We couldn't save your review. Please try again.",
        server_error: "The YAAR server is unavailable. Please try again.",
        analysis_error: "We couldn't complete the design analysis. Please try again."
    };

    alert(
        "Analysis failed\n\n" +
        (messages[error.code] || error.message || messages.analysis_error)
    );

}


// =========================================
// DISPLAY NEW REVIEW
// =========================================

function displayResults(data) {

    const result = data.result;

    if (!result) {

        alert(
            "Invalid response received from backend."
        );

        return;
    }

    const analysis =
        result.analysis || {};


    /*
     * Switch to the results screen FIRST.
     *
     * The previous version waited until all result rendering was
     * completed before changing views. If any individual result
     * renderer encountered an unexpected backend value, the view
     * could remain on the upload screen.
     *
     * Using !important here also guarantees that the JavaScript
     * view switch wins over any CSS rule that hides #resultsView.
     */
    showResultsView();


    // =====================================
    // BASIC INFORMATION
    // =====================================

    reviewId.textContent =
        result.review_id ?? "-";

    reviewFilename.textContent =
        data.filename || "UI Review";

    resultTitle.textContent =
        data.filename || "UI Analysis";


    // =====================================
    // YOLO
    // =====================================

    const yolo =
        analysis.yolo || {};

    yoloCount.textContent =
        yolo.count ?? 0;

    displayYOLOSummary(yolo);


    // =====================================
    // OCR
    // =====================================

    const ocr =
        analysis.ocr || {};

    ocrCount.textContent =
        ocr.count ?? 0;

    displayOCRSummary(ocr);


    // =====================================
    // CLIP
    // =====================================

    const clip =
        analysis.clip || {};

    clipStatus.textContent =
        "Done";

    displayCLIPSummary(clip);


    // =====================================
    // ACCESSIBILITY
    // =====================================

    const accessibility =
        analysis.accessibility || {};

    accessibilityScore.textContent =
        accessibility.accessibility_score ?? "-";

    displayAccessibility(
        accessibility
    );


    // =====================================
    // RECOMMENDATIONS
    // =====================================

    displayRecommendations(
        analysis.recommendations || [],
        result.gemini_error === true
    );


    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

}


// =========================================
// SHOW RESULTS VIEW
// =========================================

function showResultsView() {

    if (!uploadView || !resultsView) {

        console.error(
            "YAAR: uploadView or resultsView element was not found."
        );

        return;
    }

    uploadView.style.setProperty(
        "display",
        "none",
        "important"
    );

    resultsView.style.setProperty(
        "display",
        "block",
        "important"
    );

    console.log(
        "YAAR: Results view displayed."
    );

}


// =========================================
// YOLO USER-FRIENDLY DISPLAY
// =========================================

function displayYOLOSummary(yolo) {

    yoloResults.innerHTML = "";

    const elements =
        Array.isArray(yolo.elements)
            ? yolo.elements
            : [];


    if (elements.length === 0) {

        yoloResults.innerHTML =
            `
            <p class="result-empty">
                No UI elements detected.
            </p>
            `;

        return;
    }


    const wrapper =
        document.createElement("div");


    const intro =
        document.createElement("p");


    intro.innerHTML =
        `
        YAAR detected
        <strong>${elements.length}</strong>
        UI elements in the screenshot.
        `;


    wrapper.appendChild(intro);


    const list =
        document.createElement("ul");


    const classCounts = {};


    elements.forEach(function (element) {

        const className =
            element.class ||
            element.name ||
            "UI Element";


        classCounts[className] =
            (classCounts[className] || 0) + 1;

    });


    Object.entries(classCounts).forEach(
        function ([name, count]) {

            const li =
                document.createElement("li");


            li.textContent =
                `${formatLabel(name)}: ${count}`;


            list.appendChild(li);

        }
    );


    wrapper.appendChild(list);

    yoloResults.appendChild(wrapper);

}

// =========================================
// OCR USER-FRIENDLY DISPLAY
// =========================================

function displayOCRSummary(ocr) {

    ocrResults.innerHTML = "";

    const text =
        Array.isArray(ocr.text)
            ? ocr.text
            : [];


    if (text.length === 0) {

        ocrResults.innerHTML =
            `
            <p class="result-empty">
                No text regions detected.
            </p>
            `;

        return;
    }


    const wrapper =
        document.createElement("div");


    const intro =
        document.createElement("p");


    intro.innerHTML =
        `
        YAAR detected
        <strong>${text.length}</strong>
        text regions.
        `;


    wrapper.appendChild(intro);


    const list =
        document.createElement("ul");


    text.forEach(function (item) {

        let detectedText = "";


        if (typeof item === "string") {

            detectedText = item;

        } else if (
            item &&
            typeof item === "object" &&
            item.text
        ) {

            detectedText = item.text;

        } else if (
            Array.isArray(item) &&
            item[1]
        ) {

            detectedText = item[1];

        }


        if (
            detectedText &&
            detectedText.trim()
        ) {

            const li =
                document.createElement("li");


            li.textContent =
                detectedText;


            list.appendChild(li);

        }

    });


    wrapper.appendChild(list);

    ocrResults.appendChild(wrapper);

}


// =========================================
// CLIP USER-FRIENDLY DISPLAY
// =========================================

function displayCLIPSummary(clip) {

    clipResults.innerHTML = "";


    const wrapper =
        document.createElement("div");


    const title =
        document.createElement("p");


    title.innerHTML =
        `
        <strong>Visual analysis completed.</strong>
        `;


    wrapper.appendChild(title);


    const description =
        document.createElement("p");


    description.textContent =
        "YAAR used visual understanding to analyze the overall UI appearance and design structure.";


    wrapper.appendChild(description);


    clipResults.appendChild(wrapper);

}


// =========================================
// ACCESSIBILITY DISPLAY
// =========================================

function displayAccessibility(accessibility) {

    accessibilityResults.innerHTML = "";


    const score =
        accessibility.accessibility_score;


    const summary =
        document.createElement("p");


    if (
        score !== undefined &&
        score !== null
    ) {

        summary.innerHTML =
            `
            Accessibility score:
            <strong>${score}/100</strong>
            `;

    } else {

        summary.innerHTML =
            `
            <strong>
                Accessibility analysis completed.
            </strong>
            `;

    }


    accessibilityResults.appendChild(summary);


    // =====================================
    // FIND ACCESSIBILITY ISSUES
    // =====================================

    const possibleIssues =
        accessibility.issues ||
        accessibility.accessibility_issues ||
        accessibility.problems ||
        [];


    if (
        Array.isArray(possibleIssues) &&
        possibleIssues.length > 0
    ) {

        const heading =
            document.createElement("p");


        heading.innerHTML =
            `
            <strong>Areas to review:</strong>
            `;


        accessibilityResults.appendChild(
            heading
        );


        possibleIssues.forEach(
            function (issue) {

                const issueText =
                    getIssueText(issue);


                if (!issueText) {
                    return;
                }


                const item =
                    document.createElement("div");


                item.className =
                    "accessibility-issue";


                item.textContent =
                    issueText;


                accessibilityResults.appendChild(
                    item
                );

            }
        );

    } else {

        const good =
            document.createElement("p");


        good.className =
            "result-success";


        good.textContent =
            "No major accessibility issues were reported.";


        accessibilityResults.appendChild(
            good
        );

    }

}


// =========================================
// CONVERT ACCESSIBILITY ISSUE
// =========================================

function getIssueText(issue) {

    if (typeof issue === "string") {

        return issue;

    }


    if (
        !issue ||
        typeof issue !== "object"
    ) {

        return "";

    }


    if (issue.message) {

        return issue.message;

    }


    if (
        issue.type === "text" &&
        Array.isArray(issue.items)
    ) {

        return "Some text may have low readability.";

    }


    if (
        issue.type === "element_size" &&
        Array.isArray(issue.items)
    ) {

        return "Some UI elements may be too small to interact with comfortably.";

    }


    if (issue.type === "contrast") {

        return "Some UI areas may need better visual contrast.";

    }


    return "An accessibility area needs review.";

}


// =========================================
// RECOMMENDATIONS
// =========================================

function displayRecommendations(data, geminiError = false) {

    recommendations.innerHTML = "";


    if (
        !Array.isArray(data) ||
        data.length === 0
    ) {

        const message =
            document.createElement("p");


        message.className =
            "result-empty";


        message.textContent = geminiError
            ? "Gemini recommendations are temporarily unavailable. The rest of your analysis is complete."
            : "AI design recommendations will appear when Gemini review is enabled.";


        recommendations.appendChild(
            message
        );


        return;
    }


    const list =
        document.createElement("ul");


    data.forEach(function (item) {

        const li =
            document.createElement("li");


        if (typeof item === "string") {

            li.textContent =
                item;

        } else if (
            item &&
            typeof item === "object"
        ) {

            if (item.message) {

                li.textContent =
                    item.message;

            } else if (item.text) {

                li.textContent =
                    item.text;

            } else {

                li.textContent =
                    "Design recommendation available.";

            }

        }


        list.appendChild(li);

    });


    recommendations.appendChild(list);

}


// =========================================
// FORMAT LABEL
// =========================================

function formatLabel(value) {

    return String(value)
        .replace(/_/g, " ")
        .replace(/\b\w/g, char =>
            char.toUpperCase()
        );

}


// =========================================
// NEW REVIEW
// =========================================

newReviewButton.addEventListener(
    "click",
    showNewReview
);


resultNewReviewButton.addEventListener(
    "click",
    showNewReview
);


function showNewReview() {

    resetUpload();

    currentReviewData = null;


    resultsView.style.setProperty(
        "display",
        "none",
        "important"
    );


    uploadView.style.setProperty(
        "display",
        "block",
        "important"
    );


    document
        .querySelectorAll(".history-item")
        .forEach(function (item) {

            item.classList.remove("active");

        });


    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

}


// =========================================
// LOAD HISTORY
// =========================================

async function loadHistory() {

    const requestVersion = ++historyRequestVersion;

    try {

        const response =
            await fetch(
                `${API_BASE_URL}/reviews`
            );


        if (!response.ok) {

            throw new Error(
                `Server returned ${response.status}`
            );

        }


        const data =
            await response.json();

        if (requestVersion !== historyRequestVersion) {
            return;
        }


        console.log(
            "Review history:",
            data
        );


        displayHistory(
            data.reviews || []
        );


    } catch (error) {

        if (requestVersion !== historyRequestVersion) {
            return;
        }

        console.error(
            "History loading failed:",
            error
        );


        historyList.innerHTML =
            `
            <p class="history-empty">
                Unable to load history
            </p>
            `;

    }

}


// =========================================
// DISPLAY HISTORY
// =========================================

function displayHistory(reviews) {

    historyList.innerHTML = "";


    if (
        !reviews ||
        reviews.length === 0
    ) {

        historyList.innerHTML =
            `
            <p class="history-empty">
                No reviews yet
            </p>
            `;

        return;
    }


    reviews.forEach(function (review) {

        const item =
            document.createElement("div");


        item.className =
            "history-item";


        item.dataset.id =
            review.id;


        const title =
            document.createElement("strong");


        title.textContent =
            review.filename ||
            "Untitled Review";


        const info =
            document.createElement("span");


        info.textContent =
            `Review #${review.id}`;


        item.appendChild(title);

        item.appendChild(info);


        item.addEventListener(
            "click",
            function () {

                loadSingleReview(
                    review.id,
                    item
                );

            }
        );


        historyList.appendChild(item);

    });

}
// =========================================
// LOAD SINGLE REVIEW
// =========================================

async function loadSingleReview(
    id,
    clickedItem
) {

    try {

        const response =
            await fetch(
                `${API_BASE_URL}/reviews/${id}`
            );


        if (!response.ok) {

            throw new Error(
                `Server returned ${response.status}`
            );

        }


        const review =
            await response.json();


        console.log(
            "Selected review:",
            review
        );


        /*
         * Save the selected PostgreSQL review
         * so it can also be downloaded as PDF.
         */
        currentReviewData = {

            filename:
                review.filename,

            result: {

                review_id:
                    review.id,

                analysis: {

                    yolo:
                        review.yolo_results || {},

                    ocr:
                        review.ocr_results || {},

                    clip:
                        review.clip_results || {},

                    accessibility:
                        review.accessibility_results ||
                        review.accessibility ||
                        {},

                    recommendations:
                        review.recommendations || []

                }

            }

        };


        displaySavedReview(
            review
        );


        document
            .querySelectorAll(".history-item")
            .forEach(function (item) {

                item.classList.remove(
                    "active"
                );

            });


        clickedItem.classList.add(
            "active"
        );


    } catch (error) {

        console.error(
            "Failed to load review:",
            error
        );


        alert(
            "Unable to load this review."
        );

    }

}


// =========================================
// DISPLAY SAVED REVIEW
// =========================================

function displaySavedReview(review) {

    reviewId.textContent =
        review.id ?? "-";


    reviewFilename.textContent =
        review.filename || "-";


    resultTitle.textContent =
        review.filename ||
        "Saved UI Review";


    // =====================================
    // YOLO
    // =====================================

    const yolo =
        review.yolo_results || {};


    yoloCount.textContent =
        yolo.count ?? 0;


    displayYOLOSummary(
        yolo
    );


    // =====================================
    // OCR
    // =====================================

    const ocr =
        review.ocr_results || {};


    ocrCount.textContent =
        ocr.count ?? 0;


    displayOCRSummary(
        ocr
    );


    // =====================================
    // CLIP
    // =====================================

    const clip =
        review.clip_results || {};


    clipStatus.textContent =
        "Done";


    displayCLIPSummary(
        clip
    );


    // =====================================
    // ACCESSIBILITY
    // =====================================

    const accessibility =
        review.accessibility_results ||
        review.accessibility ||
        {};


    accessibilityScore.textContent =
        accessibility.accessibility_score ??
        "-";


    displayAccessibility(
        accessibility
    );


    // =====================================
    // RECOMMENDATIONS
    // =====================================

    displayRecommendations(
        review.recommendations || []
    );


    // =====================================
    // SHOW RESULT
    // =====================================

    /*
     * Use the same robust view-switching
     * function used for newly generated reviews.
     */
    showResultsView();


    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

}


// =========================================
// PDF GENERATION
// =========================================

if (downloadPdfButton) {

    downloadPdfButton.addEventListener(
        "click",
        downloadReviewPDF
    );

}


async function downloadReviewPDF() {

    if (!currentReviewData) {

        alert(
            "Please complete or open a review first."
        );

        return;
    }


    if (
        typeof window.jspdf === "undefined"
    ) {

        alert(
            "PDF generator is not loaded. Please refresh the page and try again."
        );

        return;
    }


    const buttonText =
        downloadPdfButton.querySelector(
            "span:last-child"
        );


    const originalText =
        buttonText
            ? buttonText.textContent
            : "Download Review PDF";


    try {

        if (buttonText) {

            buttonText.textContent =
                "Creating PDF...";

        }


        downloadPdfButton.disabled = true;


        const {
            jsPDF
        } = window.jspdf;


        const pdf =
            new jsPDF({

                orientation:
                    "portrait",

                unit:
                    "mm",

                format:
                    "a4"

            });


        const pageWidth =
            pdf.internal.pageSize.getWidth();


        const pageHeight =
            pdf.internal.pageSize.getHeight();


        const margin = 15;

        let y = margin;


        // =================================
        // TITLE
        // =================================

        pdf.setFontSize(20);

        pdf.setFont(
            "helvetica",
            "bold"
        );


        pdf.text(
            "YAAR AI Design Mentor",
            margin,
            y
        );


        y += 8;


        pdf.setFontSize(13);

        pdf.setFont(
            "helvetica",
            "normal"
        );


        pdf.text(
            "UI Design Review",
            margin,
            y
        );


        y += 8;


        // =================================
        // FILE INFORMATION
        // =================================

        const uploadedName =
            currentReviewData.filename ||
            currentImageFile?.name ||
            "UI Review";


        pdf.setFontSize(10);

        pdf.setTextColor(
            90,
            90,
            105
        );


        pdf.text(
            `File: ${uploadedName}`,
            margin,
            y
        );


        y += 5;


        const savedReviewId =
            currentReviewData.result?.review_id;


        if (
            savedReviewId !== undefined &&
            savedReviewId !== null
        ) {

            pdf.text(
                `Review ID: ${savedReviewId}`,
                margin,
                y
            );


            y += 5;

        }


        pdf.text(
            `Generated: ${new Date().toLocaleString()}`,
            margin,
            y
        );


        y += 8;


        pdf.setTextColor(
            30,
            30,
            40
        );


        // =================================
        // UPLOADED IMAGE
        // =================================

        if (imagePreview.src) {

            try {

                const imageData =
                    await imageToDataURL(
                        imagePreview
                    );


                const imageDimensions =
                    calculatePDFImageSize(
                        imagePreview.naturalWidth,
                        imagePreview.naturalHeight,
                        pageWidth - margin * 2,
                        80
                    );


                if (
                    y + imageDimensions.height >
                    pageHeight - margin
                ) {

                    pdf.addPage();

                    y = margin;

                }


                pdf.setFontSize(11);

                pdf.setFont(
                    "helvetica",
                    "bold"
                );


                pdf.text(
                    "Uploaded UI",
                    margin,
                    y
                );


                y += 5;


                pdf.addImage(
                    imageData,
                    getImageFormat(uploadedName),
                    margin,
                    y,
                    imageDimensions.width,
                    imageDimensions.height
                );


                y +=
                    imageDimensions.height +
                    10;


            } catch (imageError) {

                console.warn(
                    "Could not add uploaded image:",
                    imageError
                );

            }

        }


        // =================================
        // ANALYSIS
        // =================================

        const analysis =
            currentReviewData.result?.analysis ||
            {};


        // =================================
        // OVERVIEW
        // =================================

        y =
            ensurePDFSpace(
                pdf,
                y,
                35,
                margin,
                pageHeight
            );


        y =
            addPDFSectionTitle(
                pdf,
                "Analysis Overview",
                margin,
                y
            );


        const accessibility =
            analysis.accessibility ||
            {};


        const yolo =
            analysis.yolo ||
            {};


        const ocr =
            analysis.ocr ||
            {};


        y =
            addPDFText(
                pdf,
                `Accessibility Score: ${
                    accessibility.accessibility_score ??
                    "-"
                }/100`,
                margin,
                y
            );


        y =
            addPDFText(
                pdf,
                `UI Elements Detected: ${
                    yolo.count ??
                    yolo.elements?.length ??
                    0
                }`,
                margin,
                y
            );


        y =
            addPDFText(
                pdf,
                `Text Regions Detected: ${
                    ocr.count ??
                    ocr.text?.length ??
                    0
                }`,
                margin,
                y
            );


        y =
            addPDFText(
                pdf,
                "CLIP Visual Analysis: Completed",
                margin,
                y
            );


        // =================================
        // YOLO
        // =================================

        y =
            ensurePDFSpace(
                pdf,
                y,
                35,
                margin,
                pageHeight
            );


        y =
            addPDFSectionTitle(
                pdf,
                "YOLO Analysis",
                margin,
                y
            );


        const yoloElements =
            Array.isArray(yolo.elements)
                ? yolo.elements
                : [];


        if (
            yoloElements.length === 0
        ) {

            y =
                addPDFText(
                    pdf,
                    "No UI elements detected.",
                    margin,
                    y
                );

        } else {

            const classCounts = {};


            yoloElements.forEach(
                function (element) {

                    const className =
                        element.class ||
                        element.name ||
                        "UI Element";


                    classCounts[className] =
                        (classCounts[className] || 0) +
                        1;

                }
            );


            Object.entries(classCounts)
                .forEach(
                    function ([name, count]) {

                        y =
                            ensurePDFSpace(
                                pdf,
                                y,
                                10,
                                margin,
                                pageHeight
                            );


                        y =
                            addPDFText(
                                pdf,
                                `${formatLabel(name)}: ${count}`,
                                margin,
                                y
                            );

                    }
                );

        }


        // =================================
        // OCR
        // =================================

        y =
            ensurePDFSpace(
                pdf,
                y,
                35,
                margin,
                pageHeight
            );


        y =
            addPDFSectionTitle(
                pdf,
                "OCR Analysis",
                margin,
                y
            );


        const ocrText =
            Array.isArray(ocr.text)
                ? ocr.text
                : [];


        if (
            ocrText.length === 0
        ) {

            y =
                addPDFText(
                    pdf,
                    "No text regions detected.",
                    margin,
                    y
                );

        } else {

            ocrText.forEach(
                function (item) {

                    let detectedText = "";


                    if (
                        typeof item === "string"
                    ) {

                        detectedText =
                            item;

                    } else if (
                        item &&
                        typeof item === "object" &&
                        item.text
                    ) {

                        detectedText =
                            item.text;

                    } else if (
                        Array.isArray(item) &&
                        item[1]
                    ) {

                        detectedText =
                            item[1];

                    }


                    if (
                        detectedText &&
                        detectedText.trim()
                    ) {

                        y =
                            ensurePDFSpace(
                                pdf,
                                y,
                                10,
                                margin,
                                pageHeight
                            );


                        y =
                            addPDFText(
                                pdf,
                                `• ${detectedText.trim()}`,
                                margin,
                                y
                            );

                    }

                }
            );

        }


        // =================================
        // ACCESSIBILITY
        // =================================

        y =
            ensurePDFSpace(
                pdf,
                y,
                35,
                margin,
                pageHeight
            );


        y =
            addPDFSectionTitle(
                pdf,
                "Accessibility Review",
                margin,
                y
            );


        y =
            addPDFText(
                pdf,
                `Accessibility Score: ${
                    accessibility.accessibility_score ??
                    "-"
                }/100`,
                margin,
                y
            );


        const issues =
            accessibility.issues ||
            accessibility.accessibility_issues ||
            accessibility.problems ||
            [];


        if (
            Array.isArray(issues) &&
            issues.length > 0
        ) {

            y =
                addPDFText(
                    pdf,
                    "Areas to review:",
                    margin,
                    y
                );


            issues.forEach(
                function (issue) {

                    const text =
                        getIssueText(issue);


                    if (!text) {
                        return;
                    }


                    y =
                        ensurePDFSpace(
                            pdf,
                            y,
                            12,
                            margin,
                            pageHeight
                        );


                    y =
                        addPDFText(
                            pdf,
                            `• ${text}`,
                            margin,
                            y
                        );

                }
            );

        } else {

            y =
                addPDFText(
                    pdf,
                    "No major accessibility issues were reported.",
                    margin,
                    y
                );

        }


        // =================================
        // RECOMMENDATIONS
        // =================================

        y =
            ensurePDFSpace(
                pdf,
                y,
                35,
                margin,
                pageHeight
            );


        y =
            addPDFSectionTitle(
                pdf,
                "Design Recommendations",
                margin,
                y
            );


        const recommendationData =
            analysis.recommendations ||
            [];


        if (
            !Array.isArray(recommendationData) ||
            recommendationData.length === 0
        ) {

            y =
                addPDFText(
                    pdf,
                    "AI design recommendations will appear when Gemini review is enabled.",
                    margin,
                    y
                );

        } else {

            recommendationData.forEach(
                function (item) {

                    let text = "";


                    if (
                        typeof item === "string"
                    ) {

                        text = item;

                    } else if (
                        item &&
                        typeof item === "object"
                    ) {

                        text =
                            item.message ||
                            item.text ||
                            "Design recommendation available.";

                    }


                    if (text) {

                        y =
                            ensurePDFSpace(
                                pdf,
                                y,
                                15,
                                margin,
                                pageHeight
                            );


                        y =
                            addPDFText(
                                pdf,
                                `• ${text}`,
                                margin,
                                y
                            );

                    }

                }
            );

        }


        // =================================
        // SAVE PDF
        // =================================

        const pdfFilename =
            createPDFFilename(
                uploadedName
            );


        pdf.save(
            pdfFilename
        );


    } catch (error) {

        console.error(
            "PDF generation failed:",
            error
        );


        alert(
            "Unable to create the PDF review."
        );


    } finally {

        downloadPdfButton.disabled = false;


        if (buttonText) {

            buttonText.textContent =
                originalText;

        }

    }

}
// =========================================
// PDF HELPERS
// =========================================

function createPDFFilename(filename) {

    const cleanName =
        String(filename || "UI Review")
            .replace(
                /\.[^/.]+$/,
                ""
            )
            .replace(
                /[<>:"/\\|?*]+/g,
                "_"
            )
            .trim();


    return `${cleanName || "UI Review"}.pdf`;

}


// =========================================
// IMAGE → DATA URL
// =========================================

function imageToDataURL(image) {

    return new Promise(
        function (resolve, reject) {

            const canvas =
                document.createElement("canvas");


            const width =
                image.naturalWidth ||
                image.width;


            const height =
                image.naturalHeight ||
                image.height;


            if (!width || !height) {

                reject(
                    new Error(
                        "Image dimensions unavailable."
                    )
                );

                return;
            }


            canvas.width = width;

            canvas.height = height;


            const context =
                canvas.getContext("2d");


            context.drawImage(
                image,
                0,
                0,
                width,
                height
            );


            resolve(
                canvas.toDataURL(
                    "image/jpeg",
                    0.92
                )
            );

        }
    );

}


// =========================================
// IMAGE FORMAT
// =========================================

function getImageFormat(filename) {

    const extension =
        String(filename)
            .split(".")
            .pop()
            .toLowerCase();


    if (extension === "png") {

        return "PNG";

    }


    return "JPEG";

}


// =========================================
// CALCULATE IMAGE SIZE
// =========================================

function calculatePDFImageSize(
    originalWidth,
    originalHeight,
    maxWidth,
    maxHeight
) {

    if (
        !originalWidth ||
        !originalHeight
    ) {

        return {
            width: maxWidth,
            height: maxHeight
        };

    }


    const ratio =
        Math.min(
            maxWidth / originalWidth,
            maxHeight / originalHeight
        );


    return {

        width:
            originalWidth * ratio,

        height:
            originalHeight * ratio

    };

}


// =========================================
// PDF SECTION TITLE
// =========================================

function addPDFSectionTitle(
    pdf,
    title,
    margin,
    y
) {

    pdf.setFont(
        "helvetica",
        "bold"
    );


    pdf.setFontSize(13);


    pdf.setTextColor(
        30,
        30,
        45
    );


    pdf.text(
        title,
        margin,
        y
    );


    return y + 7;

}


// =========================================
// PDF TEXT
// =========================================

function addPDFText(
    pdf,
    text,
    margin,
    y
) {

    pdf.setFont(
        "helvetica",
        "normal"
    );


    pdf.setFontSize(10);


    pdf.setTextColor(
        65,
        68,
        82
    );


    const pageWidth =
        pdf.internal.pageSize.getWidth();


    const maxWidth =
        pageWidth - margin * 2;


    const lines =
        pdf.splitTextToSize(
            String(text),
            maxWidth
        );


    pdf.text(
        lines,
        margin,
        y
    );


    return y +
        (
            lines.length * 5
        ) +
        1;

}


// =========================================
// MAKE SURE THERE IS SPACE
// =========================================

function ensurePDFSpace(
    pdf,
    y,
    requiredHeight,
    margin,
    pageHeight
) {

    if (
        y + requiredHeight >
        pageHeight - margin
    ) {

        pdf.addPage();


        return margin;

    }


    return y;

}


// =========================================
// INITIALIZE
// =========================================

loading.style.display = "none";


/*
 * IMPORTANT:
 * Start on the upload screen.
 * Use !important so the initial state
 * is not overridden by CSS.
 */
resultsView.style.setProperty(
    "display",
    "none",
    "important"
);


uploadView.style.setProperty(
    "display",
    "block",
    "important"
);


analyzeButton.disabled = true;


// =========================================
// LOAD EXISTING HISTORY
// =========================================

loadHistory();


console.log(
    "YAAR AI Design Mentor frontend ready."
);