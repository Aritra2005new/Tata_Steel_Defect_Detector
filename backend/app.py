from flask import Flask, request, jsonify
from flask_cors import CORS

import torch
import torch.nn as nn
from torchvision import transforms, models
from PIL import Image
import torch.nn.functional as F

app = Flask(__name__)

CORS(app)


class_names = [
    'crazing',
    'inclusion',
    'invalid',
    'patches',
    'pitted',
    'rolled-in',
    'scratches'
]


test_tf = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
])

# ---------------- LOAD MODEL ----------------

model = models.mobilenet_v2(pretrained=False)

model.classifier[1] = nn.Linear(
    model.last_channel,
    len(class_names)
)

model.load_state_dict(
    torch.load(
        "new_steel_defect_model.pth",
        map_location=torch.device('cpu')
    )
)

model.eval()

# ---------------- HOME ROUTE ----------------

@app.route('/')
def home():

    return "Tata Steel AI Backend Running"

# ---------------- PREDICTION ROUTE ----------------

@app.route('/predict', methods=['POST'])
def predict():

    # Check image uploaded
    if 'image' not in request.files:

        return jsonify({
            "error": "No image uploaded"
        })

    file = request.files['image']

    try:

        # Open image safely
        img = Image.open(file).convert("RGB")

    except:

        return jsonify({
            "invalid": True,
            "message": "Invalid image file"
        })

    # Transform image
    img = test_tf(img).unsqueeze(0)

    # Prediction
    with torch.no_grad():

        output = model(img)

        probs = F.softmax(output, dim=1)

        conf, pred = torch.max(probs, 1)

    confidence = round(conf.item() * 100, 2)

    predicted_class = class_names[pred.item()]

    # ---------------- INVALID IMAGE CHECK ----------------

    if predicted_class == "invalid":

        return jsonify({
            "invalid": True,
            "message": "Wrong image uploaded. Please upload a valid steel defect image.",
            "confidence": confidence
        })

    # ---------------- LOW CONFIDENCE CHECK ----------------

    if confidence < 60:

        return jsonify({
            "invalid": True,
            "message": "Prediction confidence too low. Please upload a clearer steel defect image.",
            "confidence": confidence
        })

    # ---------------- FINAL RESULT ----------------

    result = {
        "prediction": predicted_class,
        "confidence": confidence
    }

    return jsonify(result)

# ---------------- RUN APP ----------------

if __name__ == '__main__':

    app.run(debug=True)